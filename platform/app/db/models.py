"""SQLAlchemy ORM models for the platform."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    """Platform user account."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(256), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")  # user | admin
    quota_tier: Mapped[str] = mapped_column(String(16), nullable=False, default="free")  # free | basic | pro
    # 运行模式，dedicated表示独立容器，shared表示用户共享openclaw
    runtime_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="dedicated", server_default="dedicated")  # dedicated | shared
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # SSO fields (e.g. 如果需要SSO登录，需要这2个字段)
    sso_uid: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    sso_token: Mapped[str | None] = mapped_column(String(256), nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    assistant_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(16), nullable=False, default="fr", server_default="fr")
    preferred_tone: Mapped[str] = mapped_column(String(32), nullable=False, default="simple", server_default="simple")
    preferred_channels: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Plan(Base):
    """Commercial and resource limits for a Kraxia offer."""

    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    launch_price_fcfa: Mapped[int] = mapped_column(Integer, nullable=False, default=15000)
    regular_price_fcfa: Mapped[int] = mapped_column(Integer, nullable=False, default=35000)
    ram_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=2 * 1024**3)
    storage_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=15 * 1024**3)
    llm_credit_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    allowed_channels: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=lambda: ["whatsapp", "telegram", "discord"])
    is_launch_offer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Subscription(Base):
    """Current commercial status of a user account."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False, default="launch")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="trial")
    payment_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    external_reference: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class UserQuota(Base):
    """Per-user resource usage and LLM credit counters."""

    __tablename__ = "user_quotas"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    plan_code: Mapped[str] = mapped_column(String(32), nullable=False, default="launch")
    storage_bytes_used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    llm_credit_cents_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    llm_input_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    llm_output_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    period_started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Container(Base):
    """Per-user Docker container metadata."""

    __tablename__ = "containers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    docker_id: Mapped[str] = mapped_column(String(128), nullable=True)  # Docker container ID
    container_token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="creating")
    # Status: creating | running | paused | archived
    internal_host: Mapped[str] = mapped_column(String(64), nullable=True)
    internal_port: Mapped[int] = mapped_column(Integer, nullable=True, default=18080)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_active_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RuntimeRun(Base):
    """Tracks runtime run ownership for access control."""

    __tablename__ = "runtime_runs"

    run_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_key: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    runtime_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="dedicated")
    backend: Mapped[str] = mapped_column(String(32), nullable=False, default="hermes")


class UserPortBinding(Base):
    """Per-user persisted host port preferences for recreated containers."""

    __tablename__ = "user_port_bindings"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    host_bind_ip: Mapped[str] = mapped_column(String(64), nullable=False, default="0.0.0.0")
    host_port_browser: Mapped[int] = mapped_column(Integer, nullable=True, unique=True)
    host_port_service: Mapped[int] = mapped_column(Integer, nullable=True, unique=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )


class CreditLedger(Base):
    """Append-only LLM credit ledger for auditable billing."""

    __tablename__ = "credit_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    usage_record_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(64), nullable=False, default="llm_usage")
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class UsageRecord(Base):
    """LLM token usage per request."""

    __tablename__ = "usage_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    upstream_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_cost_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ModelProviderConfig(Base):
    """Admin-managed LLM provider configuration."""

    __tablename__ = "model_provider_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(32), nullable=False, default="openai")
    api_base: Mapped[str | None] = mapped_column(String(512), nullable=True)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    models: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    """Audit trail for key operations."""

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)  # login | llm_call | container_create | ...
    resource: Mapped[str] = mapped_column(String(128), nullable=True)
    detail: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
