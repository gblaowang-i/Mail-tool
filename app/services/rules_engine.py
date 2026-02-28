import json
from typing import Any, List, Tuple

from app.models.email import EmailRecord
from app.models.mail_rule import MailRule


def _pattern_match(text: str, pattern: str) -> bool:
    if not pattern or not pattern.strip():
        return True
    return pattern.strip().lower() in (text or "").lower()


def apply_mail_rules(
    record: EmailRecord,
    body_text: str,
    rules: List[MailRule],
) -> Tuple[List[str], bool, bool]:
    """
    对一条邮件应用所有匹配的规则，汇总动作。
    返回 (要添加的标签列表, 是否跳过 Telegram 推送, 是否标为已读)。
    """
    labels_to_add: List[str] = []
    skip_telegram = False
    mark_read = False

    for rule in rules:
        if rule.account_id is not None and record.account_id != rule.account_id:
            continue
        if not _pattern_match(record.sender or "", rule.sender_pattern or ""):
            continue
        if not _pattern_match(record.subject or "", rule.subject_pattern or ""):
            continue
        body = body_text or record.content_summary or ""
        if not _pattern_match(body, rule.body_pattern or ""):
            continue

        try:
            add = json.loads(rule.add_labels) if rule.add_labels else []
        except Exception:
            add = []
        for lb in add:
            if isinstance(lb, str) and lb.strip() and lb.strip() not in labels_to_add:
                labels_to_add.append(lb.strip())
        if not rule.push_telegram:
            skip_telegram = True
        if rule.mark_read:
            mark_read = True

    return (labels_to_add, skip_telegram, mark_read)
