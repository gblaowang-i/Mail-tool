import asyncio
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session_factory
from app.models.email import EmailAccount
from app.models.poll_status import AccountPollStatus
from app.services.fetcher import fetch_recent_emails_for_account

last_poll_started_at: Optional[datetime] = None
last_poll_finished_at: Optional[datetime] = None
last_poll_error: Optional[str] = None

TICK_SECONDS = 5


async def poller_loop() -> None:
    global last_poll_started_at, last_poll_finished_at, last_poll_error

    settings = get_settings()
    # 解析全局轮询间隔，避免异常导致整个轮询任务直接退出
    raw_interval = getattr(settings, "poll_interval_seconds", None)
    try:
        if raw_interval in (None, "", 0):
            global_interval = 300
        else:
            global_interval = int(raw_interval)
    except Exception as exc:  # noqa: BLE001
        print(f"[poller] invalid poll_interval_seconds={raw_interval!r}, fallback=300: {exc}")
        global_interval = 300

    print(f"[poller] loop started, global_interval={global_interval}s")

    while True:
        now = datetime.utcnow()
        last_poll_started_at = now
        last_poll_error = None

        try:
            async with async_session_factory() as db_list:
                res = await db_list.execute(
                    select(EmailAccount).where(EmailAccount.is_active.is_(True))
                )
                active_accounts = list(res.scalars().all())

            for account in active_accounts:
                interval = account.poll_interval_seconds or global_interval
                interval = max(interval, 5)

                async with async_session_factory() as db:
                    status_row = await db.get(AccountPollStatus, account.id)
                    if status_row and status_row.last_started_at:
                        elapsed = (now - status_row.last_started_at).total_seconds()
                        if elapsed < interval:
                            continue

                    if not status_row:
                        status_row = AccountPollStatus(account_id=account.id)
                        db.add(status_row)
                    status_row.last_started_at = datetime.utcnow()
                    status_row.last_error = None
                    await db.commit()

                    try:
                        await fetch_recent_emails_for_account(db, account_id=account.id)
                        status_row.last_success_at = datetime.utcnow()
                    except Exception as exc:  # noqa: BLE001
                        last_poll_error = str(exc)
                        status_row.last_error = str(exc)
                    finally:
                        status_row.last_finished_at = datetime.utcnow()
                        await db.commit()
        except Exception as exc:  # noqa: BLE001
            # 捕获所有意外错误，避免轮询任务直接退出
            last_poll_error = str(exc)
            print(f"[poller] unexpected error: {exc}")
        finally:
            last_poll_finished_at = datetime.utcnow()
            await asyncio.sleep(TICK_SECONDS)
