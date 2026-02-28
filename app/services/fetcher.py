from datetime import datetime, timedelta

from anyio import to_thread
from bs4 import BeautifulSoup
from imap_tools import AND, MailBox
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import json

from app.core.encryption import decrypt_secret
from app.models.email import EmailAccount, EmailRecord
from app.models.mail_rule import MailRule
from app.models.telegram_rule import TelegramFilterRule
from app.services.rules_engine import apply_mail_rules
from app.services.telegram import send_email_notification, should_push_telegram
from app.services.webhook import send_webhook_for_email


async def fetch_recent_emails_for_account(
    db: AsyncSession,
    account_id: int,
    lookback_hours: int = 24,
) -> int:
    result = await db.execute(
        select(EmailAccount).where(EmailAccount.id == account_id)
    )
    account = result.scalars().first()
    if not account or not account.is_active:
        return 0

    # Determine whether this is an initial sync for this account.
    existing_count = await db.execute(
        select(func.count(EmailRecord.id)).where(EmailRecord.account_id == account_id)
    )
    existing_total = int(existing_count.scalar_one() or 0)

    # 初次同步：会拉取大量历史邮件用于填充列表，但不应触发“新邮件推送”，否则会疯狂推送历史邮件。
    is_initial_sync = existing_total < 50

    if is_initial_sync:
        # 初次或接近初次同步：拉取更长时间、更多数量的历史邮件。
        since_dt = datetime.utcnow() - timedelta(days=365)
        max_messages = 1000
    else:
        # 之后走增量：最近 lookback_hours 小时内的新邮件即可。
        since_dt = datetime.utcnow() - timedelta(hours=lookback_hours)
        max_messages = 200

    password = decrypt_secret(account.encrypted_pwd)

    def _extract_message_id(msg: object, account_id: int) -> str:
        # imap_tools message objects vary by version; prefer RFC Message-ID header.
        msg_id = getattr(msg, "message_id", None)
        if isinstance(msg_id, str) and msg_id.strip():
            return msg_id.strip()

        headers = getattr(msg, "headers", None)
        if isinstance(headers, dict):
            hdr = headers.get("message-id") or headers.get("Message-ID") or headers.get("Message-Id")
            if isinstance(hdr, str) and hdr.strip():
                return hdr.strip()

        uid = getattr(msg, "uid", None)
        if uid:
            return f"{account_id}:{uid}"
        return ""

    def _to_plain_text(html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n")
        # Basic cleanup
        lines = [ln.strip() for ln in text.splitlines()]
        lines = [ln for ln in lines if ln]
        return "\n".join(lines)

    def _fetch_sync() -> list[tuple[str, str, str, datetime, str, str]]:
        items: list[tuple[str, str, str, datetime, str, str]] = []
        with MailBox(account.host).login(account.email, password, "INBOX") as mbox:
            for msg in mbox.fetch(
                AND(date_gte=since_dt.date()),
                reverse=True,
                limit=max_messages,
            ):
                message_id = _extract_message_id(msg, account.id)
                if not message_id:
                    continue
                subject = msg.subject or ""
                sender = msg.from_ or ""
                received_at = msg.date or datetime.utcnow()
                html = getattr(msg, "html", None) or ""
                text = getattr(msg, "text", None) or ""
                if not text and html:
                    text = _to_plain_text(html)
                items.append((message_id, subject, sender, received_at, text, html))
        return items

    fetched = await to_thread.run_sync(_fetch_sync)

    inserted = 0
    updated = 0
    new_records: list[EmailRecord] = []

    for message_id, subject, sender, received_at, body_text, body_html in fetched:
        existing_q = await db.execute(
            select(EmailRecord).where(EmailRecord.message_id == message_id)
        )
        existing = existing_q.scalars().first()

        # If already exists, backfill body fields when missing.
        if existing:
            changed = False
            if (not existing.body_text) and body_text:
                existing.body_text = body_text
                changed = True
            if (not existing.body_html) and body_html:
                existing.body_html = body_html
                changed = True
            # Keep summary aligned with body when it was previously just a subject snippet.
            if changed and existing.content_summary == (existing.subject or "")[:200]:
                summary_src = body_text or existing.subject or ""
                existing.content_summary = summary_src.replace("\r", "").strip()[:200]
            if changed:
                updated += 1
            continue

        summary_src = body_text or subject
        summary = (summary_src or "").replace("\r", "").strip()[:200]
        record = EmailRecord(
            message_id=message_id,
            account_id=account.id,
            subject=subject[:255],
            sender=sender[:255],
            content_summary=summary,
            body_text=(body_text or None),
            body_html=(body_html or None),
            received_at=received_at,
        )
        db.add(record)
        new_records.append((record, body_text or ""))

    await db.commit()

    mail_rules_result = await db.execute(
        select(MailRule).order_by(MailRule.rule_order, MailRule.id)
    )
    mail_rules = list(mail_rules_result.scalars().all())

    skip_telegram_by_id: dict[int, bool] = {}
    for record, body_text in new_records:
        labels_to_add, skip_telegram, mark_read = apply_mail_rules(
            record, body_text, mail_rules
        )
        skip_telegram_by_id[record.id] = skip_telegram
        existing = []
        if record.labels:
            try:
                existing = json.loads(record.labels) if record.labels.strip() else []
            except Exception:
                pass
        seen = set(existing)
        for lb in labels_to_add:
            if lb not in seen:
                existing.append(lb)
                seen.add(lb)
        record.labels = json.dumps(existing, ensure_ascii=False)
        if mark_read:
            record.is_read = True
    if new_records:
        await db.commit()

    telegram_rules_result = await db.execute(
        select(TelegramFilterRule)
        .where(TelegramFilterRule.account_id == account.id)
        .order_by(TelegramFilterRule.rule_order, TelegramFilterRule.id)
    )
    telegram_rules = list(telegram_rules_result.scalars().all())

    # 初次同步仅入库，不推送；后续增量才推送真正的新邮件。
    if not is_initial_sync:
        for record, _ in new_records:
            skip_from_mail = skip_telegram_by_id.get(record.id, False)
            if should_push_telegram(record, account, telegram_rules, skip_from_mail):
                await send_email_notification(record, account)
            await send_webhook_for_email(record, account.email)

    return inserted + updated

