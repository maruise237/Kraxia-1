"""User-facing channel connections for Kraxia."""

from __future__ import annotations

import base64
import hashlib
import json
from datetime import datetime

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

import logging

from app.auth.dependencies import get_current_user
from app.config import settings
from app.container.manager import ensure_running, get_docker_container, update_hermes_channel_env
from app.db.engine import get_db
from app.db.models import ChannelConnection, User

router = APIRouter(prefix="/api/channels", tags=["channels"])
logger = logging.getLogger(__name__)
ALLOWED_CHANNELS = {"whatsapp", "telegram", "discord"}


def _fernet_for_secret(secret: str) -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _fernets() -> list[Fernet]:
    """Return the active key and legacy JWT-derived key during safe rotation."""
    secrets = [settings.channel_encryption_key or settings.jwt_secret]
    if settings.channel_encryption_key and settings.jwt_secret and settings.channel_encryption_key != settings.jwt_secret:
        secrets.append(settings.jwt_secret)
    return [_fernet_for_secret(secret) for secret in secrets if secret]


def _encrypt_config(credentials: dict[str, str]) -> str:
    payload = json.dumps(credentials, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return _fernets()[0].encrypt(payload).decode("ascii")


def _decrypt_config(encrypted_config: str) -> dict[str, str]:
    last_error: Exception | None = None
    for fernet in _fernets():
        try:
            payload = fernet.decrypt(encrypted_config.encode("ascii"))
            value = json.loads(payload.decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError("configuration de canal invalide")
            return {str(key): str(item) for key, item in value.items()}
        except Exception as exc:
            last_error = exc
    raise ValueError("configuration de canal illisible") from last_error


def _validate_channel(channel: str) -> str:
    normalized = channel.strip().lower()
    if normalized not in ALLOWED_CHANNELS:
        raise HTTPException(status_code=400, detail="Canal non pris en charge.")
    return normalized


class ChannelConnectionRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=128)
    credentials: dict[str, str] = Field(default_factory=dict)


def _channel_env(channel: str, credentials: dict[str, str]) -> dict[str, str]:
    env_map = {
        "telegram": {"token": "TELEGRAM_BOT_TOKEN", "allowed_users": "TELEGRAM_ALLOWED_USERS"},
        "discord": {"token": "DISCORD_BOT_TOKEN", "allowed_users": "DISCORD_ALLOWED_USERS"},
        "whatsapp": {
            "allowed_users": "WHATSAPP_ALLOWED_USERS",
            "enabled": "WHATSAPP_ENABLED",
            "mode": "WHATSAPP_MODE",
        },
    }[channel]
    return {env_map[key]: value for key, value in credentials.items() if key in env_map}


def _channel_env_keys(channel: str) -> set[str]:
    return set(_channel_env(channel, {"token": "", "allowed_users": "", "enabled": "", "mode": ""}))


async def restore_channel_connections(db: AsyncSession, user_id: str, docker_container) -> None:
    """Reapply encrypted channel settings after a runtime is created or recreated."""
    result = await db.execute(select(ChannelConnection).where(ChannelConnection.user_id == user_id))
    merged: dict[str, str] = {}
    for connection in result.scalars().all():
        if not connection.encrypted_config:
            continue
        try:
            merged.update(_channel_env(connection.channel, _decrypt_config(connection.encrypted_config)))
        except ValueError:
            logger.warning("Unable to restore channel configuration for user %s", user_id)
            connection.status = "error"
            connection.last_error = "Configuration de canal illisible après rotation de clé."
    if merged:
        update_hermes_channel_env(docker_container, merged)


@router.get("")
async def list_channels(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChannelConnection).where(ChannelConnection.user_id == user.id)
    )
    connections = result.scalars().all()
    by_channel = {
        item.channel: {
            "channel": item.channel,
            "display_name": item.display_name,
            "status": item.status,
            "connected_at": item.connected_at.isoformat() if item.connected_at else None,
            "has_credentials": bool(item.encrypted_config),
            "last_error": item.last_error,
        }
        for item in connections
    }
    return {"channels": [by_channel.get(channel, {"channel": channel, "status": "not_connected", "has_credentials": False}) for channel in sorted(ALLOWED_CHANNELS)]}


@router.put("/{channel}")
async def connect_channel(
    channel: str,
    req: ChannelConnectionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = _validate_channel(channel)
    credentials = {key.strip(): value.strip() for key, value in req.credentials.items() if key.strip() and value.strip()}
    if not credentials:
        raise HTTPException(status_code=400, detail="Ajoute les informations de connexion du canal.")

    allowed_keys = {"token", "allowed_users"} if channel != "whatsapp" else {"allowed_users", "enabled", "mode"}
    unknown_keys = set(credentials) - allowed_keys
    if unknown_keys:
        raise HTTPException(status_code=400, detail="Informations de connexion non reconnues pour ce canal.")
    if channel == "whatsapp":
        credentials.setdefault("enabled", "true")
        credentials.setdefault("mode", "bot")

    result = await db.execute(
        select(ChannelConnection).where(
            ChannelConnection.user_id == user.id,
            ChannelConnection.channel == channel,
        )
    )
    connection = result.scalar_one_or_none()
    if connection is None:
        connection = ChannelConnection(
            user_id=user.id,
            channel=channel,
            encrypted_config=_encrypt_config(credentials),
        )
        db.add(connection)
    else:
        connection.encrypted_config = _encrypt_config(credentials)
        connection.status = "configured"
        connection.last_error = None
    connection.display_name = (req.display_name or channel.title())[:128]
    connection.connected_at = datetime.utcnow()

    try:
        runtime = await ensure_running(db, user.id)
        if settings.dedicated_runtime_backend != "hermes":
            raise RuntimeError("Le runtime Hermes est requis pour connecter ce canal.")
        if not runtime.docker_id:
            raise RuntimeError("Runtime Docker indisponible")
        docker_container = get_docker_container(runtime.docker_id)
        update_hermes_channel_env(
            docker_container,
            _channel_env(channel, credentials),
            remove_keys=_channel_env_keys(channel),
        )
        connection.status = "pairing_required" if channel == "whatsapp" else "connected"
        connection.last_error = None
    except Exception as exc:
        connection.status = "error"
        connection.last_error = str(exc)[:1000]
        await db.commit()
        raise HTTPException(status_code=502, detail="Le canal n’a pas pu être démarré. Vérifie les informations fournies.") from exc

    await db.commit()
    return {
        "ok": True,
        "channel": channel,
        "status": connection.status,
        "display_name": connection.display_name,
        "has_credentials": True,
    }


@router.delete("/{channel}")
async def disconnect_channel(
    channel: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = _validate_channel(channel)
    result = await db.execute(
        select(ChannelConnection).where(
            ChannelConnection.user_id == user.id,
            ChannelConnection.channel == channel,
        )
    )
    connection = result.scalar_one_or_none()
    await db.execute(
        delete(ChannelConnection).where(
            ChannelConnection.user_id == user.id,
            ChannelConnection.channel == channel,
        )
    )
    try:
        runtime = await ensure_running(db, user.id)
        if runtime.docker_id:
            docker_container = get_docker_container(runtime.docker_id)
            update_hermes_channel_env(docker_container, {}, remove_keys=_channel_env_keys(channel))
    except Exception:
        logger.warning("Unable to clear runtime channel variables for user %s", user.id)
    await db.commit()
    return {"ok": True, "channel": channel, "status": "not_connected", "had_credentials": bool(connection and connection.encrypted_config)}
