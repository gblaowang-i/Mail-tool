from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import bcrypt

from app.core.auth import create_access_token, login_required, verify_api_token
from app.core.config import get_settings, set_db_overrides
from app.api.settings import load_settings_from_db
from app.core.database import get_db

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)

ADMIN_PASSWORD_HASH_KEY = "admin_password_hash"


async def _get_admin_password_hash(db: AsyncSession) -> str | None:
    result = await db.execute(
        text("SELECT value FROM system_settings WHERE key = :k"),
        {"k": ADMIN_PASSWORD_HASH_KEY},
    )
    row = result.mappings().first()
    if row is None:
        return None
    val = row.get("value")
    return (val if isinstance(val, str) else str(val)) if val is not None else None


def _verify_password(plain: str, env_password: str | None, stored_hash: str | None) -> bool:
    plain = (plain or "").strip()
    hash_str = (stored_hash or "").strip()
    if hash_str:
        try:
            return bcrypt.checkpw(
                plain.encode("utf-8"),
                hash_str.encode("utf-8"),
            )
        except Exception:
            return False
    return (env_password or "").strip() == plain


@router.get("/config")
async def auth_config() -> dict:
    """是否启用登录、是否支持重置密码（无需认证）。"""
    s = get_settings()
    return {
        "login_required": login_required(),
        "reset_available": bool((s.admin_reset_token or "").strip()),
    }


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginBody, db: AsyncSession = Depends(get_db)) -> dict:
    """用户名密码登录，返回 JWT。密码可为 .env 或修改密码后存于 DB 的哈希。"""
    if not login_required():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="未启用登录（请配置 ADMIN_USERNAME 与 ADMIN_PASSWORD）",
        )
    settings = get_settings()
    username = (body.username or "").strip()
    password = body.password
    expected_user = (settings.admin_username or "").strip()
    if not expected_user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="服务端未配置登录账号",
        )
    stored_hash = await _get_admin_password_hash(db)
    env_pwd = (settings.admin_password or "").strip()
    if not stored_hash and not env_pwd:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="服务端未配置登录密码",
        )
    # 一旦 DB 中有哈希则只认哈希，不再用 .env 密码，避免“改密后仍用旧密码”的问题
    pwd_ok = _verify_password(password, env_pwd if not stored_hash else None, stored_hash)
    if username != expected_user or not pwd_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    token = create_access_token(username)
    return {"access_token": token, "token_type": "bearer", "username": username}


@router.get("/me", dependencies=[Depends(verify_api_token)])
async def me() -> dict:
    """返回当前认证信息（需已登录或携带有效 Token）。"""
    return {"ok": True}


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password", dependencies=[Depends(verify_api_token)])
async def change_password(
    body: ChangePasswordBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """修改密码：需提供当前密码，新密码将写入 DB（bcrypt）。"""
    if not body.new_password or len(body.new_password.strip()) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码至少 6 位",
        )
    settings = get_settings()
    expected_user = (settings.admin_username or "").strip()
    if not expected_user:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="未配置管理员")
    stored_hash = await _get_admin_password_hash(db)
    env_pwd = (settings.admin_password or "").strip()
    if not _verify_password(body.current_password, env_pwd, stored_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="当前密码错误")
    new_hash = bcrypt.hashpw(
        body.new_password.strip().encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")
    await db.execute(
        text("INSERT OR REPLACE INTO system_settings (key, value) VALUES (:k, :v)"),
        {"k": ADMIN_PASSWORD_HASH_KEY, "v": new_hash},
    )
    await db.commit()
    set_db_overrides(await load_settings_from_db(db))
    return {"ok": True, "message": "密码已修改，请使用新密码登录"}


class ResetPasswordBody(BaseModel):
    reset_token: str
    new_password: str


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordBody,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """忘记密码时用 .env 中的 ADMIN_RESET_TOKEN 重置密码（无需登录）。"""
    if not body.reset_token or not (body.new_password or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请填写重置令牌和新密码",
        )
    if len(body.new_password.strip()) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码至少 6 位",
        )
    settings = get_settings()
    expected = (settings.admin_reset_token or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="服务端未启用重置密码（需配置 ADMIN_RESET_TOKEN）",
        )
    if body.reset_token.strip() != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="重置令牌错误")
    new_hash = bcrypt.hashpw(
        body.new_password.strip().encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")
    await db.execute(
        text("INSERT OR REPLACE INTO system_settings (key, value) VALUES (:k, :v)"),
        {"k": ADMIN_PASSWORD_HASH_KEY, "v": new_hash},
    )
    await db.commit()
    set_db_overrides(await load_settings_from_db(db))
    return {"ok": True, "message": "密码已重置，请使用新密码登录"}
