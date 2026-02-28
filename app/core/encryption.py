from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def _is_valid_fernet_key(key: str) -> bool:
    try:
        Fernet(key.encode("utf-8"))
        return True
    except Exception:
        return False


def ensure_encryption_key() -> str:
    """
    Ensure ENCRYPTION_KEY exists and is valid.

    For local/dev convenience: if missing/invalid, generate one and persist to .env,
    and also set it into process env so Settings can pick it up.
    """
    existing = os.environ.get("ENCRYPTION_KEY")
    if existing and _is_valid_fernet_key(existing):
        return existing

    settings = get_settings()
    if settings.encryption_key and _is_valid_fernet_key(settings.encryption_key):
        os.environ["ENCRYPTION_KEY"] = settings.encryption_key
        return settings.encryption_key

    new_key = Fernet.generate_key().decode("utf-8")
    os.environ["ENCRYPTION_KEY"] = new_key

    env_path = Path(".env")
    try:
        if env_path.exists():
            lines = env_path.read_text(encoding="utf-8").splitlines()
        else:
            lines = []

        written = False
        out_lines: list[str] = []
        for line in lines:
            if line.strip().startswith("ENCRYPTION_KEY="):
                out_lines.append(f"ENCRYPTION_KEY={new_key}")
                written = True
            else:
                out_lines.append(line)
        if not written:
            if out_lines and out_lines[-1].strip() != "":
                out_lines.append("")
            out_lines.append(f"ENCRYPTION_KEY={new_key}")

        env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    except OSError:
        pass
    return new_key


def get_fernet() -> Fernet:
    settings = get_settings()
    raw_key = settings.encryption_key or os.environ.get("ENCRYPTION_KEY")
    if not raw_key or not _is_valid_fernet_key(raw_key):
        raise ValueError(
            "Invalid ENCRYPTION_KEY. Run once to generate a key or set ENCRYPTION_KEY in .env"
        )
    return Fernet(raw_key.encode("utf-8"))


def encrypt_secret(plain: str) -> str:
    f = get_fernet()
    return f.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    f = get_fernet()
    try:
        return f.decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Invalid encryption token")

