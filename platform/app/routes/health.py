"""Operational health endpoints for Kraxia."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.engine import get_db

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    database = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        database = "error"

    payload = {
        "service": "kraxia-platform",
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "runtime_backend": settings.dedicated_runtime_backend,
        "version": "0.1.0",
    }
    return JSONResponse(status_code=200 if database == "ok" else 503, content=payload)
