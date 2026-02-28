from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class TelegramFilterRule(Base):
    """Per-account rule: allow/deny Telegram push by sender, domain, subject, or body."""

    __tablename__ = "telegram_filter_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    field: Mapped[str] = mapped_column(String(32))  # sender | domain | subject | body
    mode: Mapped[str] = mapped_column(String(16))  # allow | deny
    value: Mapped[str] = mapped_column(Text)  # substring, case-insensitive
    rule_order: Mapped[int] = mapped_column(Integer, default=0)

    account: Mapped["EmailAccount"] = relationship(
        "EmailAccount", back_populates="telegram_filter_rules"
    )
