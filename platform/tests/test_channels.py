from types import SimpleNamespace

from app.config import Settings
from app.routes import channels


def test_channel_credentials_roundtrip_and_legacy_key_rotation(monkeypatch):
    monkeypatch.setattr(channels.settings, "channel_encryption_key", "")
    monkeypatch.setattr(channels.settings, "jwt_secret", "legacy-jwt-secret")
    encrypted = channels._encrypt_config({"token": "secret-token", "allowed_users": "123"})

    monkeypatch.setattr(channels.settings, "channel_encryption_key", "fresh-fernet-secret")
    assert channels._decrypt_config(encrypted) == {
        "token": "secret-token",
        "allowed_users": "123",
    }


def test_channel_mapping_keeps_secret_out_of_public_shape():
    env = channels._channel_env(
        "telegram",
        {"token": "bot-secret", "allowed_users": "123,456"},
    )
    assert env == {
        "TELEGRAM_BOT_TOKEN": "bot-secret",
        "TELEGRAM_ALLOWED_USERS": "123,456",
    }
    public = {
        "channel": "telegram",
        "status": "connected",
        "has_credentials": True,
    }
    assert "bot-secret" not in public.values()
    assert channels._channel_env_keys("telegram") == {
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_ALLOWED_USERS",
    }


def test_channel_mapping_supports_whatsapp_pairing_defaults():
    env = channels._channel_env(
        "whatsapp",
        {"allowed_users": "237600000000", "enabled": "true", "mode": "bot"},
    )
    assert env == {
        "WHATSAPP_ALLOWED_USERS": "237600000000",
        "WHATSAPP_ENABLED": "true",
        "WHATSAPP_MODE": "bot",
    }


def test_update_hermes_channel_env_removes_old_values(monkeypatch):
    recorded = {}

    class Container:
        def put_archive(self, path, payload):
            recorded["path"] = path
            recorded["payload"] = payload
            return True

        def restart(self):
            recorded["restarted"] = True

    monkeypatch.setattr(
        channels,
        "update_hermes_channel_env",
        __import__("app.container.manager", fromlist=["update_hermes_channel_env"]).update_hermes_channel_env,
    )
    from app.container import manager

    monkeypatch.setattr(
        manager,
        "_read_existing_hermes_env_channel_vars",
        lambda container: {
            "TELEGRAM_BOT_TOKEN": "old",
            "TELEGRAM_ALLOWED_USERS": "123",
            "DISCORD_BOT_TOKEN": "keep",
        },
    )
    monkeypatch.setattr(manager, "_repair_hermes_data_ownership", lambda container: recorded.update(owner_fixed=True))
    manager.update_hermes_channel_env(
        Container(),
        {},
        remove_keys={"TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USERS"},
    )
    assert recorded["path"] == "/opt/data"
    assert recorded["restarted"] is True
    assert recorded["owner_fixed"] is True
    assert b"DISCORD_BOT_TOKEN=keep" in recorded["payload"]
    assert b"TELEGRAM_BOT_TOKEN=old" not in recorded["payload"]
