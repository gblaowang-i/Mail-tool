from datetime import datetime
from typing import Optional

from fastapi import APIRouter

from app.worker.poller import (
    last_poll_error,
    last_poll_finished_at,
    last_poll_started_at,
)

router = APIRouter(tags=["health"])


def _to_iso(dt: Optional[datetime]) -> Optional[str]:
  return dt.isoformat() + "Z" if dt is not None else None


@router.get("/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "poller": {
            "last_started_at": _to_iso(last_poll_started_at),
            "last_finished_at": _to_iso(last_poll_finished_at),
            "last_error": last_poll_error,
        },
    }

