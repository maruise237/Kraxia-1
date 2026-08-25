"""Kraxia plans, entitlements and resource quota helpers."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Plan, Subscription, UserQuota

LAUNCH_PLAN_CODE = "launch"
LAUNCH_PLAN = {
    "code": LAUNCH_PLAN_CODE,
    "name": "Kraxia — Offre de lancement",
    "launch_price_fcfa": 15000,
    "regular_price_fcfa": 35000,
    "ram_bytes": 2 * 1024**3,
    "storage_bytes": 15 * 1024**3,
    "llm_credit_cents": 500,
    "allowed_channels": ["whatsapp", "telegram", "discord"],
    "is_launch_offer": True,
    "is_active": True,
}


async def ensure_launch_plan(db: AsyncSession) -> Plan:
    """Create the launch offer once and return it."""
    result = await db.execute(select(Plan).where(Plan.code == LAUNCH_PLAN_CODE))
    plan = result.scalar_one_or_none()
    if plan is None:
        plan = Plan(**LAUNCH_PLAN)
        db.add(plan)
        await db.flush()
    return plan


async def ensure_user_entitlements(
    db: AsyncSession,
    user_id: str,
    *,
    plan_code: str = LAUNCH_PLAN_CODE,
    subscription_status: str = "trial",
) -> tuple[Subscription, UserQuota]:
    """Ensure one subscription and one quota counter exist for a user."""
    await ensure_launch_plan(db)

    subscription_result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    subscription = subscription_result.scalar_one_or_none()
    if subscription is None:
        subscription = Subscription(
            user_id=user_id,
            plan_code=plan_code,
            status=subscription_status,
        )
        db.add(subscription)
    elif not subscription.plan_code:
        subscription.plan_code = plan_code

    quota_result = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    quota = quota_result.scalar_one_or_none()
    if quota is None:
        quota = UserQuota(user_id=user_id, plan_code=plan_code)
        db.add(quota)
    elif not quota.plan_code:
        quota.plan_code = plan_code

    await db.flush()
    return subscription, quota


async def get_user_entitlements(
    db: AsyncSession,
    user_id: str,
) -> tuple[Plan | None, Subscription | None, UserQuota | None]:
    """Return the user's plan, subscription and counters."""
    subscription_result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    subscription = subscription_result.scalar_one_or_none()
    plan_code = subscription.plan_code if subscription else LAUNCH_PLAN_CODE

    plan_result = await db.execute(select(Plan).where(Plan.code == plan_code))
    plan = plan_result.scalar_one_or_none()
    quota_result = await db.execute(select(UserQuota).where(UserQuota.user_id == user_id))
    quota = quota_result.scalar_one_or_none()
    return plan, subscription, quota


def quota_snapshot(
    plan: Plan | None,
    subscription: Subscription | None,
    quota: UserQuota | None,
) -> dict:
    """Serialize a safe, user-facing quota snapshot without secrets."""
    return {
        "plan": {
            "code": plan.code if plan else LAUNCH_PLAN_CODE,
            "name": plan.name if plan else LAUNCH_PLAN["name"],
            "launch_price_fcfa": plan.launch_price_fcfa if plan else LAUNCH_PLAN["launch_price_fcfa"],
            "regular_price_fcfa": plan.regular_price_fcfa if plan else LAUNCH_PLAN["regular_price_fcfa"],
            "ram_bytes": plan.ram_bytes if plan else LAUNCH_PLAN["ram_bytes"],
            "storage_bytes": plan.storage_bytes if plan else LAUNCH_PLAN["storage_bytes"],
            "llm_credit_cents": plan.llm_credit_cents if plan else LAUNCH_PLAN["llm_credit_cents"],
            "allowed_channels": plan.allowed_channels if plan else LAUNCH_PLAN["allowed_channels"],
        },
        "subscription": {
            "status": subscription.status if subscription else "trial",
            "payment_provider": subscription.payment_provider if subscription else None,
            "starts_at": subscription.starts_at.isoformat() if subscription and subscription.starts_at else None,
            "current_period_end": subscription.current_period_end.isoformat() if subscription and subscription.current_period_end else None,
        },
        "usage": {
            "storage_bytes_used": quota.storage_bytes_used if quota else 0,
            "llm_credit_cents_used": quota.llm_credit_cents_used if quota else 0,
            "llm_credit_cents_remaining": max(
                0,
                (plan.llm_credit_cents if plan else LAUNCH_PLAN["llm_credit_cents"])
                - (quota.llm_credit_cents_used if quota else 0),
            ),
            "llm_input_tokens": quota.llm_input_tokens if quota else 0,
            "llm_output_tokens": quota.llm_output_tokens if quota else 0,
            "updated_at": quota.updated_at.isoformat() if quota and quota.updated_at else None,
        },
    }


def reset_period_if_needed(quota: UserQuota, now: datetime) -> None:
    """Reset period counters at the beginning of a new UTC calendar month."""
    if quota.period_started_at and quota.period_started_at.year == now.year and quota.period_started_at.month == now.month:
        return
    quota.period_started_at = now
    quota.llm_credit_cents_used = 0
    quota.llm_input_tokens = 0
    quota.llm_output_tokens = 0
