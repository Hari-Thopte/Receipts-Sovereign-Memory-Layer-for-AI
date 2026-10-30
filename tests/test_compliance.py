"""Offline regression tests for Token Factory compliance and secret masking."""

import asyncio
from datetime import datetime

from app.config import settings
from app.crypto_sync import decrypt_vault_payload, encrypt_vault_payload
from app.main import get_engine_status
from app import nemotron as nemotron_module
from app.nemotron import NemotronClient
from app.models import MemoryCreateRequest
from app.vault import LocalVault
from app.seed_data import seed_vault


def test_provider_endpoint_is_always_nebius_token_factory(monkeypatch):
    monkeypatch.setattr(settings, "NEBIUS_API_KEY", "nvapi-not-a-real-key")
    monkeypatch.setattr(settings, "NEBIUS_BASE_URL", "https://example.invalid/v1")

    assert settings.resolve_base_url() == "https://api.tokenfactory.nebius.com/v1"


def test_engine_status_does_not_expose_api_key(monkeypatch):
    secret = "test-secret-that-must-not-appear"
    monkeypatch.setattr(settings, "NEBIUS_API_KEY", secret)

    status = get_engine_status()

    assert secret not in repr(status)
    assert "key_prefix" not in status
    assert status["connection_verified"] is False
    assert status["state"] == "configured"


def test_model_call_retries_then_uses_configured_fallback(monkeypatch, tmp_path):
    statuses = [503, 503, 503, 200]
    requested_models = []

    class Response:
        def __init__(self, status_code):
            self.status_code = status_code

        def json(self):
            return {"choices": [{"message": {"content": "fallback answer"}}]}

    class Client:
        def __init__(self, **_kwargs):
            print("fake-client-init", flush=True)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, *, headers, json):
            print("fake-post", json["model"], flush=True)
            requested_models.append(json["model"])
            return Response(statuses.pop(0))

    monkeypatch.setattr(settings, "NEBIUS_API_KEY", "test-token-fake")
    monkeypatch.setattr(nemotron_module.httpx, "AsyncClient", Client)
    monkeypatch.setattr(nemotron_module, "_RETRY_BACKOFF", 0)
    test_vault = LocalVault(str(tmp_path / "ledger-test.db"))
    monkeypatch.setattr(nemotron_module, "vault", test_vault)
    client = NemotronClient()

    result = asyncio.run(client._call_nebius(
        system_prompt="synthetic",
        user_message="synthetic",
        model="configured-primary",
        fallback_model="configured-fallback",
    ))

    assert requested_models == ["configured-primary"] * 3 + ["configured-fallback"]
    assert result.text == "fallback answer"
    assert result.model == "configured-fallback"
    assert result.degraded_message
    ledger = test_vault.list_outbound_requests()
    assert len(ledger) == 4
    assert ledger[-1]["request"]["messages"][1]["content"] == "synthetic"
    assert "Authorization" not in repr(ledger)


def test_sync_round_trip_uses_authenticated_bundle():
    payload = {"user_id": "test", "memories": [], "memory_count": 0}

    encrypted = encrypt_vault_payload(payload, "test-passphrase")

    assert decrypt_vault_payload(encrypted, "test-passphrase") == payload


def test_receipt_hash_chain_detects_tampering_and_blocks_writes(tmp_path):
    vault = LocalVault(str(tmp_path / "receipt-chain.db"))
    created = vault.add_memory(MemoryCreateRequest(
        content="A test preference.",
        source_title="Test source",
        source_excerpt="The user stated this preference.",
    ))

    assert created.previous_hash == "GENESIS"
    assert vault.verify_integrity()["valid"] is True
    with vault._get_connection() as conn:
        conn.execute("UPDATE memories SET content = ? WHERE id = ?", ("Tampered content", created.id))
        conn.commit()

    result = vault.verify_integrity()
    assert result["valid"] is False
    assert result["failed_receipt_id"] == created.id
    try:
        vault.confirm_freshness(created.id)
    except ValueError as exc:
        assert "integrity check failed" in str(exc)
    else:
        raise AssertionError("A tampered vault must reject further writes.")


def test_seed_adds_conflicting_location_without_replacing_existing_memory(tmp_path):
    test_vault = LocalVault(str(tmp_path / "seed-conflict-test.db"))
    preserved = test_vault.add_memory(MemoryCreateRequest(
        content="Keep this pre-existing test memory.",
        source_title="Test source",
        source_excerpt="An existing local record.",
    ))

    seed_vault(test_vault)
    seed_vault(test_vault)

    memories = {memory.id: memory for memory in test_vault.list_memories()}
    assert memories[preserved.id].content == "Keep this pre-existing test memory."
    assert memories["REC-AUS7"].content == "User moved to Austin, Texas and now operates on Central Time (CST/CDT, UTC-6/UTC-5)."
    assert sum(memory.id == "REC-AUS7" for memory in memories.values()) == 1

    fresh_vault = LocalVault(str(tmp_path / "fresh-seed-test.db"))
    seed_vault(fresh_vault)
    fresh_memories = {memory.id: memory for memory in fresh_vault.list_memories()}
    assert datetime.fromisoformat(fresh_memories["REC-AUS7"].created_at) > datetime.fromisoformat(fresh_memories["REC-PST4"].created_at)
