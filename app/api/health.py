from datetime import datetime
from typing import Optional

from fastapi import APIRouter

from app.worker import poller

router = APIRouter(tags=["health"])


def _to_iso(dt: Optional[datetime]) -> Optional[str]:
  return dt.isoformat() + "Z" if dt is not None else None


@router.get("/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "poller": {
            "last_started_at": _to_iso(poller.last_poll_started_at),
            "last_finished_at": _to_iso(poller.last_poll_finished_at),
            "last_error": poller.last_poll_error,
        },
    }

