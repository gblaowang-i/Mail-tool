from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class EmailAccount(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    provider: Mapped[str] = mapped_column(String, default="custom")
    encrypted_pwd: Mapped[str] = mapped_column(String)
    host: Mapped[str] = mapped_column(String, default="imap.gmail.com")
    port: Mapped[int] = mapped_column(Integer, default=993)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    telegram_push_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    push_template: Mapped[str] = mapped_column(String, default="short")  # full | short | title_only
    poll_interval_seconds: Mapped[int] = mapped_column(Integer, nullable=True, default=None)

    emails: Mapped[list["EmailRecord"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )
    telegram_filter_rules: Mapped[list["TelegramFilterRule"]] = relationship(
        "TelegramFilterRule", back_populates="account", cascade="all, delete-orphan"
    )


class EmailRecord(Base):
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    subject: Mapped[str] = mapped_column(String)
    sender: Mapped[str] = mapped_column(String)
    content_summary: Mapped[str] = mapped_column(Text)
    body_text: Mapped[str] = mapped_column(Text, nullable=True)
    body_html: Mapped[str] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    labels: Mapped[str] = mapped_column(Text, nullable=True, default="[]")

    account: Mapped[EmailAccount] = relationship(back_populates="emails")

