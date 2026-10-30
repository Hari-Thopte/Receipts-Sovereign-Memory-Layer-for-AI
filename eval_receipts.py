"""
eval_receipts.py
================
Evaluation suite for the Receipts sovereign memory layer.

Runs deterministic test cases against NemotronClient, LocalVault, and TavilyService.
Works fully offline in simulation mode when API keys are blank, and automatically
runs live Nebius Token Factory inference if NEBIUS_API_KEY is configured.

Tests cover:
  1-4.   Citation accuracy        — correct receipt IDs appear in responses
  5-6.   Stale exclusion/inclusion— stale receipts filtered out by default, admitted with flag
  7-8.   Context relevance        — irrelevant receipts excluded; unmatched queries don't hallucinate
  9-10.  Deletion integrity       — permanent erasure + tombstone audit record
  11.    Super reasoning cleanup  — strips <think> / <thought> tags from Nemotron Super responses
  12.    Nano JSON parsing        — robust extraction across markdown fences, thinking tags, objects
  13.    Ingest hash verification — SHA-256 digest stored at creation and compared against live content
  14.    Live Nebius execution    — tested live if NEBIUS_API_KEY is present, skipped gracefully if blank

Run with:
    python eval_receipts.py
"""

import asyncio
import sys
import os
import tempfile
import json
import hashlib
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Make sure project root is on sys.path ─────────────────────────────────────
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.config import settings
from app.vault import LocalVault
from app.nemotron import NemotronClient, clean_reasoning_text, parse_nano_json
from app.seed_data import seed_vault
from app.models import MemoryCreateRequest
from app.tavily_service import TavilyService, _sha256_hex

# ── Helpers ───────────────────────────────────────────────────────────────────

PASS_LABEL = "\033[32mPASS\033[0m"
FAIL_LABEL = "\033[31mFAIL\033[0m"
SKIP_LABEL = "\033[33mSKIP\033[0m"
results: list = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    status = PASS_LABEL if condition else FAIL_LABEL
    print(f"  [{status}] {name}" + (f"\n         {detail}" if detail and not condition else ""))
    results.append({"name": name, "passed": condition, "detail": detail})
    return condition


def skip(name: str, reason: str = ""):
    print(f"  [{SKIP_LABEL}] {name} ({reason})")
    results.append({"name": name, "passed": True, "detail": f"Skipped: {reason}"})


async def run_query(client: NemotronClient, vault: LocalVault, query: str, include_stale: bool = False):
    mems = vault.list_memories()
    return await client.answer_query(query, mems, include_stale=include_stale)


# ── Core Vault & Citation Tests ───────────────────────────────────────────────

async def test_citation_async_planning(client, vault):
    """T1: Query about async sprint planning must cite REC-ASYNC1."""
    resp = await run_query(client, vault, "How should we schedule sprint planning?")
    check(
        "T1 - Citation: sprint planning cites REC-ASYNC1",
        "REC-ASYNC1" in resp.answer,
        f"answer={resp.answer[:120]}",
    )


async def test_citation_coffee(client, vault):
    """T2: Query about coffee order must cite REC-COFFEE5."""
    resp = await run_query(client, vault, "What coffee do I drink?")
    check(
        "T2 - Citation: coffee query cites REC-COFFEE5",
        "REC-COFFEE5" in resp.answer,
        f"answer={resp.answer[:120]}",
    )


async def test_citation_location(client, vault):
    """T3: Query about timezone must cite REC-PST4."""
    mems = vault.list_memories()
    resp = await client.answer_query("What city and timezone am I in?", mems, include_stale=False, max_receipts=6)
    check(
        "T3 - Citation: location query cites REC-PST4",
        "REC-PST4" in resp.answer,
        f"answer={resp.answer[:120]}",
    )


async def test_citation_nebius(client, vault):
    """T4: Query about Nemotron/Nebius must cite REC-NEMO3."""
    resp = await run_query(client, vault, "What Nemotron models are available on Nebius?")
    check(
        "T4 - Citation: Nebius/Nemotron query cites REC-NEMO3",
        "REC-NEMO3" in resp.answer,
        f"answer={resp.answer[:120]}",
    )


async def test_stale_excluded_by_default(client, vault):
    """T5: Stale receipt (REC-STALE6) must NOT appear in context by default."""
    resp = await run_query(client, vault, "What is my roaming phone number?", include_stale=False)
    stale_content_leaked = "REC-STALE6" in resp.answer or "555-0199" in resp.answer
    check(
        "T5 - Stale exclusion: stale phone number absent from default query",
        not stale_content_leaked,
        f"answer={resp.answer[:200]}",
    )


async def test_stale_included_when_flag_set(client, vault):
    """T6: filter_context must include stale receipts when include_stale=True."""
    mems = vault.list_memories()
    without_stale = client.filter_context("roaming phone number", mems, max_receipts=10, include_stale=False)
    stale_ids_without = [r.id for r in without_stale if r.status == "stale"]

    with_stale = client.filter_context("roaming phone number", mems, max_receipts=10, include_stale=True)
    stale_ids_with = [r.id for r in with_stale if r.status == "stale"]

    check(
        "T6 - Stale inclusion: include_stale=True admits stale receipts into context",
        len(stale_ids_with) > 0 and len(stale_ids_without) == 0,
        f"with_stale_ids={stale_ids_with}, without_stale_ids={stale_ids_without}",
    )


async def test_irrelevant_receipt_not_cited(client, vault):
    """T7: Coffee query must NOT cite project receipt REC-RUST2."""
    resp = await run_query(client, vault, "What coffee do I drink?")
    check(
        "T7 - Relevance: coffee query does not leak REC-RUST2 (Rust sprint)",
        "REC-RUST2" not in resp.answer,
        f"answer={resp.answer[:200]}",
    )


async def test_no_hallucination_without_receipts(client, vault):
    """T8: A query with no matching receipts must produce a 'no receipts' response."""
    resp = await run_query(client, vault, "What is the weather in Tokyo today?")
    no_receipt_signal = any(
        phrase in resp.answer.lower()
        for phrase in ["no verified memory", "no matching", "no receipts", "cannot find", "no verified",
                       "will not guess", "not extrapolate"]
    )
    check(
        "T8 - No hallucination: unmatched query returns 'no receipt' response",
        no_receipt_signal,
        f"answer={resp.answer[:200]}",
    )


async def test_post_delete_query(client, vault):
    """T9: After deleting REC-COFFEE5, coffee queries must not cite it."""
    vault.delete_memory("REC-COFFEE5")
    resp = await run_query(client, vault, "What coffee do I drink?")
    check(
        "T9 - Post-deletion: deleted REC-COFFEE5 not cited in later query",
        "REC-COFFEE5" not in resp.answer,
        f"answer={resp.answer[:200]}",
    )


async def test_tombstone_created_on_delete(client, vault):
    """T10: Deleting a receipt must create a tombstone entry."""
    vault.delete_memory("REC-PST4")
    tombstones = vault.get_tombstones()
    found = any(t["receipt_id"] == "REC-PST4" for t in tombstones)
    still_alive = vault.get_memory("REC-PST4") is not None
    check(
        "T10 - Tombstone: REC-PST4 deletion produces tombstone record",
        found and not still_alive,
        f"tombstones={tombstones}, memory_still_exists={still_alive}",
    )


# ── Reasoning & Robust JSON Extraction Tests ──────────────────────────────────

def test_super_reasoning_cleanup():
    """T11: Tests that clean_reasoning_text properly strips stray reasoning tokens."""
    raw_with_think = (
        "<think>\nThe user is asking about sprint planning. Looking at memory receipts, "
        "REC-ASYNC1 states a preference for async updates.\n</think>\n"
        "Please schedule the sprint planning asynchronously [Receipt #REC-ASYNC1]."
    )
    cleaned_a = clean_reasoning_text(raw_with_think)
    ok_a = "<think>" not in cleaned_a and "REC-ASYNC1" in cleaned_a

    raw_with_thought = (
        "<thought>Evaluating user coffee preference...</thought>"
        "You drink oat milk lattes [Receipt #REC-COFFEE5]."
    )
    cleaned_b = clean_reasoning_text(raw_with_thought)
    ok_b = "<thought>" not in cleaned_b and "REC-COFFEE5" in cleaned_b

    raw_with_prefix = (
        "Thinking Process:\n1. User asks for location.\n2. REC-PST4 has Seattle.\n\n"
        "Final Answer: You are based in Seattle, Washington on Pacific Time [Receipt #REC-PST4]."
    )
    cleaned_c = clean_reasoning_text(raw_with_prefix)
    ok_c = "Thinking Process" not in cleaned_c and "Seattle" in cleaned_c

    check(
        "T11 - Super Reasoning: stray <think>/<thought> tags stripped cleanly",
        ok_a and ok_b and ok_c,
        f"cleaned_a='{cleaned_a}', cleaned_b='{cleaned_b}', cleaned_c='{cleaned_c}'",
    )


def test_nano_json_parsing_robustness():
    """T12: Tests parse_nano_json across real-world edge cases."""
    sample_1 = (
        "Here are the facts I extracted from the conversation:\n"
        "```json\n"
        '[{"content": "Likes matcha", "category": "preference", "decay_curve": "lifestyle_preference", '
        '"source_excerpt": "I love matcha lattes", "confidence": 0.95}]\n'
        "```"
    )
    res_1 = parse_nano_json(sample_1)
    ok_1 = len(res_1) == 1 and res_1[0]["content"] == "Likes matcha"

    sample_2 = (
        "<think>Identifying durable personal facts. Found Rust migration goal.</think>\n"
        '[{"content": "Migrating to Rust", "category": "active_project", "decay_curve": "active_project", '
        '"source_excerpt": "Moving to Rust", "confidence": 0.90}]'
    )
    res_2 = parse_nano_json(sample_2)
    ok_2 = len(res_2) == 1 and res_2[0]["content"] == "Migrating to Rust"

    sample_3 = (
        '{"facts": [{"content": "Operates on PST", "category": "personal", '
        '"decay_curve": "lifestyle_preference", "source_excerpt": "Working hours: 09:30 PST", "confidence": 0.92}]}'
    )
    res_3 = parse_nano_json(sample_3)
    ok_3 = len(res_3) == 1 and res_3[0]["content"] == "Operates on PST"

    sample_4 = (
        '[{"content": "Oat milk only", "category": "preference", "decay_curve": "lifestyle_preference", '
        '"source_excerpt": "Oat milk only please", "confidence": 0.98}, ]'
    )
    res_4 = parse_nano_json(sample_4)
    ok_4 = len(res_4) == 1 and res_4[0]["content"] == "Oat milk only"

    check(
        "T12 - Nano JSON: robust parsing over fences, thoughts, objects, and trailing commas",
        ok_1 and ok_2 and ok_3 and ok_4,
        f"res_1={len(res_1)}, res_2={len(res_2)}, res_3={len(res_3)}, res_4={len(res_4)}",
    )


# ── Tavily & Cryptographic Ingest Hash Tests ──────────────────────────────────

async def test_ingest_hash_verification(vault):
    """T13: Ingest stores SHA-256 digest and verifies against live content."""
    excerpt = "Nebius Token Factory offers OpenAI-compatible access to NVIDIA Nemotron models."
    expected_hash = hashlib.sha256(excerpt.encode("utf-8")).hexdigest()

    req = MemoryCreateRequest(
        content="Nebius Token Factory supports Nemotron",
        category="factual_web",
        source_type="tavily_search",
        source_title="Nebius Catalog",
        source_excerpt=excerpt,
        source_url="https://example.com/models",
    )
    mem = vault.add_memory(req, receipt_id="REC-TESTHASH1")
    stored_hash_ok = mem.source_hash == expected_hash

    from app.tavily_service import _compare_excerpt
    live_page_ok = f"Welcome to our documentation. {excerpt} Check docs for more."
    res_match = _compare_excerpt(
        live_text=live_page_ok,
        original_snippet=excerpt,
        stored_hash=mem.source_hash,
        excerpt_prefix=excerpt[:80],
        now_iso="2026-10-27T00:00:00Z",
        via="test",
    )
    match_ok = res_match["status"] == "verified_active" and res_match.get("hash_verified") is True

    live_page_drifted = "Welcome to our documentation. Nebius has deprecated all older models. Check docs for more."
    res_drift = _compare_excerpt(
        live_text=live_page_drifted,
        original_snippet=excerpt,
        stored_hash=mem.source_hash,
        excerpt_prefix=excerpt[:80],
        now_iso="2026-10-27T00:00:00Z",
        via="test",
    )
    drift_ok = res_drift["status"] == "content_drift"

    check(
        "T13 - Ingest Hash: SHA-256 stored at ingest and verified against live page",
        stored_hash_ok and match_ok and drift_ok,
        f"stored_hash_ok={stored_hash_ok}, match_status={res_match['status']}, drift_status={res_drift['status']}",
    )


# ── Live Inference Test (when key is provided) ────────────────────────────────

async def test_live_nebius_if_configured(vault):
    """T14: Live Nemotron Super & Nano call if NEBIUS_API_KEY is configured."""
    key = settings.NEBIUS_API_KEY.strip()
    if not key or key == "mock" or len(key) < 10:
        skip("T14 - Live Nebius Token Factory", "NEBIUS_API_KEY is blank in .env")
        return

    client = NemotronClient()
    mems = vault.list_memories()

    print("      Executing live call to Nebius Token Factory...")
    try:
        resp = await client.answer_query("How should we schedule sprint planning?", mems)
        live_super_ok = not resp.is_simulated and "<think>" not in resp.answer and len(resp.used_receipts) > 0

        nano_facts = await client.extract_facts_from_turn(
            user_message="I recently switched to drinking espresso instead of drip coffee.",
            assistant_answer="Got it, I'll remember that you prefer espresso.",
            existing_receipt_ids=[m.id for m in mems],
        )
        live_nano_ok = isinstance(nano_facts, list)

        check(
            "T14 - Live Nebius: real Super answers & Nano fact extraction verified",
            live_super_ok and live_nano_ok,
            f"model={resp.model_used}, is_simulated={resp.is_simulated}, nano_facts={len(nano_facts)}",
        )
    except Exception as exc:
        check("T14 - Live Nebius: call executed without unhandled errors", False, str(exc))


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    print("\n" + "=" * 65)
    print("  Receipts Evaluation Suite")
    print(f"  Nemotron Super Model:  {settings.NEMOTRON_CHAT_MODEL}")
    print(f"  Nemotron Nano Model:   {settings.NEMOTRON_EXTRACT_MODEL}")
    print(f"  Nebius API Key:        {'Configured' if settings.NEBIUS_API_KEY else 'Blank (Simulation Mode)'}")
    print(f"  Tavily API Key:        {'Configured' if settings.TAVILY_API_KEY else 'Blank (Fallback Mode)'}")
    print("=" * 65)

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmpdir:
        db_path = str(Path(tmpdir) / "eval_vault.db")
        vault = LocalVault(db_path=db_path)
        seed_vault(vault, force_reset=True)
        client = NemotronClient()

        print("\n-- Citation accuracy ------------------------------------------")
        await test_citation_async_planning(client, vault)
        await test_citation_coffee(client, vault)
        await test_citation_location(client, vault)
        await test_citation_nebius(client, vault)

        print("\n-- Stale exclusion / inclusion --------------------------------")
        await test_stale_excluded_by_default(client, vault)
        await test_stale_included_when_flag_set(client, vault)

        print("\n-- Context relevance & Hallucination Guard --------------------")
        await test_irrelevant_receipt_not_cited(client, vault)
        await test_no_hallucination_without_receipts(client, vault)

        print("\n-- Deletion integrity & Tombstones ----------------------------")
        await test_post_delete_query(client, vault)
        await test_tombstone_created_on_delete(client, vault)

        print("\n-- Nemotron Super & Nano Robustness ---------------------------")
        test_super_reasoning_cleanup()
        test_nano_json_parsing_robustness()

        print("\n-- Provenance Ingest Hash Verification ------------------------")
        await test_ingest_hash_verification(vault)

        print("\n-- Live Inference (Nebius Token Factory) ----------------------")
        await test_live_nebius_if_configured(vault)

    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    failed = total - passed
    print("\n" + "=" * 65)
    print(f"  Result: {passed}/{total} passed", end="")
    if failed:
        print(f"  <-- {failed} FAILED")
        for r in results:
            if not r["passed"]:
                print(f"    * {r['name']}: {r['detail']}")
    else:
        print("  -- all green")
    print("=" * 65 + "\n")
    return failed


if __name__ == "__main__":
    failed = asyncio.run(main())
    sys.exit(1 if failed else 0)
