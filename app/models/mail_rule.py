from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MailRule(Base):
    """全局邮件规则：条件匹配后执行打标签、是否推送 Telegram、是否标已读等。"""
    __tablename__ = "mail_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=True, default="")
    rule_order: Mapped[int] = mapped_column(Integer, default=0)

    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    sender_pattern: Mapped[str] = mapped_column(String(512), nullable=True, default="")
    subject_pattern: Mapped[str] = mapped_column(String(512), nullable=True, default="")
    body_pattern: Mapped[str] = mapped_column(String(512), nullable=True, default="")

    add_labels: Mapped[str] = mapped_column(Text, nullable=True, default="[]")
    push_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    mark_read: Mapped[bool] = mapped_column(Boolean, default=False)
