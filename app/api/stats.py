import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import Select, case, delete, func, select, text, union_all
from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import verify_api_token
from app.core.config import get_settings
from app.core.database import engine, get_db
from app.models.email import EmailAccount, EmailRecord

router = APIRouter(
    prefix="/stats",
    tags=["stats"],
    dependencies=[Depends(verify_api_token)],
)

ARCHIVE_DIR = Path("./archives")


def _as_date_str(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


async def _sqlite_vacuum_if_possible() -> None:
    try:
        if engine.dialect.name != "sqlite":
            return
        # VACUUM cannot run inside a transaction; use a plain connection.
        async with engine.connect() as conn:
            await conn.execute(text("VACUUM"))
            await conn.commit()
    except Exception:
        # Best-effort only; cleanup should not fail due to VACUUM.
        return


def _get_db_file_info() -> dict[str, Any]:
    s = get_settings()
    try:
        url = make_url(str(s.database_url))
    except Exception:
        return {"path": None, "size_bytes": None}

    if url.drivername.split("+", 1)[0] != "sqlite":
        return {"path": None, "size_bytes": None}

    db_path = url.database
    if not db_path:
        return {"path": None, "size_bytes": None}

    p = Path(db_path)
    if not p.is_absolute():
        p = (Path.cwd() / p).resolve()
    if not p.exists():
        return {"path": str(p), "size_bytes": None}
    try:
        return {"path": str(p), "size_bytes": int(p.stat().st_size)}
    except Exception:
        return {"path": str(p), "size_bytes": None}


@router.get("/overview")
async def get_overview(
    days: int = Query(default=30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    now = datetime.utcnow()
    start_day = (now.date() - timedelta(days=days - 1))
    start_dt = datetime.combine(start_day, datetime.min.time())

    total_emails = (await db.execute(select(func.count(EmailRecord.id)))).scalar_one()
    unread_emails = (
        await db.execute(
            select(func.count(EmailRecord.id)).where(EmailRecord.is_read.is_(False))
        )
    ).scalar_one()
    total_accounts = (await db.execute(select(func.count(EmailAccount.id)))).scalar_one()

    min_max = await db.execute(
        select(func.min(EmailRecord.received_at), func.max(EmailRecord.received_at))
    )
    (oldest, newest) = min_max.first() or (None, None)

    # Daily trend
    daily_stmt: Select = (
        select(func.date(EmailRecord.received_at).label("d"), func.count(EmailRecord.id).label("c"))
        .where(EmailRecord.received_at >= start_dt)
        .group_by(text("d"))
        .order_by(text("d"))
    )
    daily_rows = (await db.execute(daily_stmt)).all()
    daily_map: dict[str, int] = {}
    for d, c in daily_rows:
        if d is None:
            continue
        daily_map[str(d)] = int(c or 0)

    daily: list[dict[str, Any]] = []
    cur = start_day
    for _ in range(days):
        key = _as_date_str(cur)
        daily.append({"date": key, "count": int(daily_map.get(key, 0))})
        cur = cur + timedelta(days=1)

    # Weekly trend derived from daily
    weekly_map: dict[str, int] = {}
    for item in daily:
        d = datetime.strptime(item["date"], "%Y-%m-%d").date()
        ws = _monday_of(d)
        k = _as_date_str(ws)
        weekly_map[k] = weekly_map.get(k, 0) + int(item["count"])
    weekly = [{"week_start": k, "count": weekly_map[k]} for k in sorted(weekly_map.keys())]

    # By account
    unread_case = case((EmailRecord.is_read.is_(False), 1), else_=0)
    by_acc_stmt: Select = (
        select(
            EmailAccount.id.label("account_id"),
            EmailAccount.email.label("account_email"),
            func.count(EmailRecord.id).label("total"),
            func.sum(unread_case).label("unread"),
        )
        .join(EmailRecord, EmailRecord.account_id == EmailAccount.id, isouter=True)
        .group_by(EmailAccount.id, EmailAccount.email)
        .order_by(func.count(EmailRecord.id).desc(), EmailAccount.email.asc())
    )
    by_acc_rows = (await db.execute(by_acc_stmt)).mappings().all()
    by_account = []
    total_for_share = int(total_emails or 0) or 1
    for r in by_acc_rows:
        by_account.append(
            {
                "account_id": int(r["account_id"]),
                "account_email": r["account_email"],
                "total": int(r["total"] or 0),
                "unread": int(r["unread"] or 0),
                "share": float((int(r["total"] or 0)) / total_for_share),
            }
        )

    return {
        "totals": {
            "emails": int(total_emails or 0),
            "unread": int(unread_emails or 0),
            "accounts": int(total_accounts or 0),
            "oldest_received_at": oldest.isoformat() if oldest else None,
            "newest_received_at": newest.isoformat() if newest else None,
        },
        "trend": {"daily": daily, "weekly": weekly},
        "by_account": by_account,
        "db": _get_db_file_info(),
    }


class CleanupRequest(BaseModel):
    keep_days: Optional[int] = Field(default=None, ge=1, description="Keep newest N days; delete older emails")
    keep_per_account: Optional[int] = Field(
        default=None, ge=1, description="Keep newest N emails per account; delete overflow"
    )
    use_settings_defaults: bool = Field(default=True, description="Use retention_* defaults from settings when not provided")
    dry_run: bool = Field(default=True, description="Only compute deletions; do not modify database")
    vacuum: bool = Field(default=False, description="Run VACUUM after deletion (SQLite only)")


@router.post("/cleanup")
async def cleanup_emails(
    body: CleanupRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    s = get_settings()
    keep_days = body.keep_days
    keep_per_account = body.keep_per_account
    if body.use_settings_defaults:
        if keep_days is None:
            keep_days = s.retention_keep_days
        if keep_per_account is None:
            keep_per_account = s.retention_keep_per_account

    if keep_days is None and keep_per_account is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide keep_days or keep_per_account (or set retention defaults in settings).",
        )

    now = datetime.utcnow()
    cutoff_dt: Optional[datetime] = None
    if keep_days is not None:
        cutoff_dt = datetime.combine((now.date() - timedelta(days=keep_days)), datetime.min.time())

    # Candidate queries
    candidates = []
    if cutoff_dt is not None:
        candidates.append(select(EmailRecord.id.label("id")).where(EmailRecord.received_at < cutoff_dt))

    overflow_stmt = None
    if keep_per_account is not None:
        ranked = (
            select(
                EmailRecord.id.label("id"),
                func.row_number()
                .over(
                    partition_by=EmailRecord.account_id,
                    order_by=EmailRecord.received_at.desc(),
                )
                .label("rn"),
            )
        ).subquery()
        overflow_stmt = select(ranked.c.id.label("id")).where(ranked.c.rn > keep_per_account)
        candidates.append(overflow_stmt)

    if len(candidates) == 1:
        union_ids = candidates[0].subquery()
        would_delete = (await db.execute(select(func.count(union_ids.c.id)))).scalar_one()
    else:
        u = union_all(*candidates).subquery()
        would_delete = (await db.execute(select(func.count(func.distinct(u.c.id))))).scalar_one()

    would_delete = int(would_delete or 0)

    details = {"by_days": 0, "by_overflow": 0}
    if cutoff_dt is not None:
        details["by_days"] = int(
            (
                await db.execute(
                    select(func.count(EmailRecord.id)).where(EmailRecord.received_at < cutoff_dt)
                )
            ).scalar_one()
            or 0
        )
    if overflow_stmt is not None:
        sub = overflow_stmt.subquery()
        details["by_overflow"] = int(
            (await db.execute(select(func.count(sub.c.id)))).scalar_one() or 0
        )

    if body.dry_run:
        return {
            "dry_run": True,
            "keep_days": keep_days,
            "keep_per_account": keep_per_account,
            "cutoff": cutoff_dt.isoformat() if cutoff_dt else None,
            "would_delete": would_delete,
            "details": details,
        }

    deleted_days = 0
    deleted_overflow = 0
    if cutoff_dt is not None:
        res = await db.execute(delete(EmailRecord).where(EmailRecord.received_at < cutoff_dt))
        deleted_days = int(res.rowcount or 0)
    if keep_per_account is not None:
        ranked = (
            select(
                EmailRecord.id.label("id"),
                func.row_number()
                .over(
                    partition_by=EmailRecord.account_id,
                    order_by=EmailRecord.received_at.desc(),
                )
                .label("rn"),
            )
        ).subquery()
        overflow_ids = select(ranked.c.id).where(ranked.c.rn > keep_per_account)
        res2 = await db.execute(delete(EmailRecord).where(EmailRecord.id.in_(overflow_ids)))
        deleted_overflow = int(res2.rowcount or 0)

    await db.commit()
    if body.vacuum:
        await _sqlite_vacuum_if_possible()

    return {
        "dry_run": False,
        "keep_days": keep_days,
        "keep_per_account": keep_per_account,
        "cutoff": cutoff_dt.isoformat() if cutoff_dt else None,
        "deleted": int(deleted_days + deleted_overflow),
        "details": {"by_days": deleted_days, "by_overflow": deleted_overflow},
        "vacuumed": bool(body.vacuum and engine.dialect.name == "sqlite"),
    }


class ArchiveRequest(BaseModel):
    older_than_days: int = Field(..., ge=1, le=36500)
    delete_after: bool = Field(default=False)
    limit: int = Field(default=0, ge=0, le=200000, description="Safety limit; 0 means no limit")


@router.post("/archive")
async def archive_emails(
    body: ArchiveRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    cutoff = datetime.utcnow() - timedelta(days=body.older_than_days)
    stmt: Select = (
        select(
            EmailRecord.id,
            EmailRecord.message_id,
            EmailRecord.account_id,
            EmailAccount.email.label("account_email"),
            EmailRecord.subject,
            EmailRecord.sender,
            EmailRecord.content_summary,
            EmailRecord.received_at,
            EmailRecord.is_read,
            EmailRecord.labels,
        )
        .join(EmailAccount, EmailAccount.id == EmailRecord.account_id)
        .where(EmailRecord.received_at < cutoff)
        .order_by(EmailRecord.received_at.asc())
    )
    if body.limit and body.limit > 0:
        stmt = stmt.limit(body.limit)

    rows = (await db.execute(stmt)).mappings().all()
    if not rows:
        return {"count": 0, "file_name": None, "download_url": None}

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    file_name = f"emails_archive_{ts}.jsonl"
    file_path = (ARCHIVE_DIR / file_name).resolve()

    ids: list[int] = []
    with file_path.open("w", encoding="utf-8") as f:
        for r in rows:
            ids.append(int(r["id"]))
            payload = dict(r)
            if payload.get("received_at") is not None:
                payload["received_at"] = payload["received_at"].isoformat()
            # Normalize labels to list for convenience
            try:
                payload["labels"] = json.loads(payload.get("labels") or "[]")
            except Exception:
                payload["labels"] = []
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")

    deleted = 0
    if body.delete_after:
        res = await db.execute(delete(EmailRecord).where(EmailRecord.id.in_(ids)))
        deleted = int(res.rowcount or 0)
        await db.commit()

    return {
        "count": len(ids),
        "deleted": deleted,
        "file_name": file_name,
        "download_url": f"/api/stats/archive/{file_name}",
        "cutoff": cutoff.isoformat(),
    }


@router.get("/archive/{file_name}")
async def download_archive(file_name: str) -> FileResponse:
    if "/" in file_name or "\\" in file_name or ".." in file_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file name")
    file_path = (ARCHIVE_DIR / file_name).resolve()
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return FileResponse(
        path=str(file_path),
        media_type="application/jsonl",
        filename=file_name,
    )

