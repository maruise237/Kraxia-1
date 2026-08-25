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

from app.auth.dependencies import get_current_user
from app.config import settings
from app.db.engine import get_db
from app.db.models import ChannelConnection, User

router = APIRouter(prefix="/api/channels", tags=["channels"])
ALLOWED_CHANNELS = {"whatsapp", "telegram", "discord"}


def _fernet() -> Fernet:
    secret = (settings.channel_encryption_key or settings.jwt_secret).encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def _encrypt_config(credentials: dict[str, str]) -> str:
    payload = json.dumps(credentials, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return _fernet().encrypt(payload).decode("ascii")


def _validate_channel(channel: str) -> str:
    normalized = channel.strip().lower()
    if normalized not in ALLOWED_CHANNELS:
        raise HTTPException(status_code=400, detail="Canal non pris en charge.")
    return normalized


class ChannelConnectionRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=128)
    credentials: dict[str, str] = Field(default_factory=dict)


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
    await db.execute(
        delete(ChannelConnection).where(
            ChannelConnection.user_id == user.id,
            ChannelConnection.channel == channel,
        )
    )
    await db.commit()
    return {"ok": True, "channel": channel, "status": "not_connected"}
