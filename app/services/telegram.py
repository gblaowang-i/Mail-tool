from __future__ import annotations

from typing import Any, Optional

import httpx

from app.core.config import get_settings
from app.models.email import EmailAccount, EmailRecord


def _get_record_field(record: EmailRecord, field: str) -> str:
    """Get the value for a rule field (sender, domain, subject, body). Case-insensitive match."""
    raw: str
    if field == "sender":
        raw = record.sender or ""
    elif field == "domain":
        s = record.sender or ""
        if "@" in s:
            raw = s.split("@")[-1].strip()
        else:
            raw = s
    elif field == "subject":
        raw = record.subject or ""
    elif field == "body":
        raw = (record.body_text or record.content_summary or "")[:2000]
    else:
        raw = ""
    return raw.lower()


def should_push_telegram(
    record: EmailRecord,
    account: EmailAccount,
    rules: list[Any],
    skip_from_mail_rules: bool = False,
) -> bool:
    """
    Decide whether to push this email to Telegram based on account settings and rules.
    - If account.telegram_push_enabled is False, never push.
    - If skip_from_mail_rules is True (matched a global mail rule that disables push), do not push.
    - Deny rules: if any rule (mode=deny) matches, do not push.
    - Allow rules: if there are allow rules, at least one must match; if no allow rules, push (unless deny matched).
    """
    if not getattr(account, "telegram_push_enabled", True):
        return False
    if skip_from_mail_rules:
        return False
    allow_rules = [r for r in rules if getattr(r, "mode", "") == "allow"]
    deny_rules = [r for r in rules if getattr(r, "mode", "") == "deny"]
    for r in deny_rules:
        val = (getattr(r, "value", None) or "").strip().lower()
        if not val:
            continue
        if val in _get_record_field(record, getattr(r, "field", "")):
            return False
    if allow_rules:
        for r in allow_rules:
            val = (getattr(r, "value", None) or "").strip().lower()
            if not val:
                continue
            if val in _get_record_field(record, getattr(r, "field", "")):
                return True
        return False
    return True


async def send_telegram_message(text: str) -> None:
    """
    Send a raw text message via Telegram Bot API.
    If Telegram is not configured, this is a no-op.
    """
    settings = get_settings()
    token: Optional[str] = settings.telegram_bot_token
    chat_id: Optional[str] = settings.telegram_chat_id

    if not token or not chat_id:
        return

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    timeout = httpx.Timeout(10.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            await client.post(url, json=payload)
        except Exception:
            # Swallow all errors to avoid impacting the main flow.
            # Logging can be added later if needed.
            return


def _escape_html(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _build_preview(preview_source: str, max_lines: int = 8, max_len: int = 80) -> str:
    preview_lines: list[str] = []
    for ln in preview_source.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        if len(ln) > max_len:
            ln = ln[: max_len - 1] + "…"
        preview_lines.append(ln)
        if len(preview_lines) >= max_lines:
            break
    return _escape_html("\n".join(preview_lines)) if preview_lines else ""


async def send_email_notification(
    record: EmailRecord,
    account: EmailAccount,
    template: Optional[str] = None,
) -> None:
    """
    Push a formatted email notification to Telegram.
    template: "full" (long preview) | "short" (fewer lines) | "title_only" (no body).
    """
    template = template or getattr(account, "push_template", "short") or "short"
    subject_raw = record.subject or "(无主题)"
    sender_raw = record.sender or ""
    account_email_raw = account.email or ""

    subject = _escape_html(subject_raw)
    sender = _escape_html(sender_raw)
    account_email = _escape_html(account_email_raw)

    lines: list[str] = [
        f"📬 <b>{subject}</b>",
        f"发件人: <code>{sender}</code>",
        f"账户: <code>{account_email}</code>",
    ]
    if record.received_at:
        lines.append(f"时间: {record.received_at:%Y-%m-%d %H:%M}")

    if template != "title_only":
        preview_source = (record.body_text or record.content_summary or "").strip()
        if preview_source:
            if template == "full_email":
                # 推送完整邮件正文，受 Telegram 单条 4096 字符限制
                preview = _escape_html(preview_source)
                if len(preview) > 3800:
                    preview = preview[:3800] + "…"
            elif template == "full":
                preview = _build_preview(preview_source, max_lines=12, max_len=80)
            else:
                preview = _build_preview(preview_source, max_lines=4, max_len=60)
            if preview:
                lines.append("")
                lines.append("内容预览：" if template != "full_email" else "正文：")
                lines.append(preview)

    text = "\n".join(lines)
    if len(text) > 4096:
        text = text[:4092] + "…"
    await send_telegram_message(text)

