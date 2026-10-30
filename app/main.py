import re
import math
import logging
from fastapi import FastAPI, HTTPException, Query as FastQuery
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Optional, List
from datetime import datetime, timezone, timedelta

from app.config import settings, BASE_DIR
from app.models import (
    MemoryReceipt, MemoryCreateRequest, MemoryCorrectionRequest,
    QueryRequest, QueryResponse, TavilySearchIngestRequest,
    TavilyVerifyRequest, TavilyVerifyResponse, SettingsUpdateRequest,
    NanoSaveRequest, NanoExtractedFact, VaultStats,
    # New models
    ConflictCheckRequest, ConflictResult,
    StalenessAlert,
    SyncExportRequest, SyncImportRequest, SyncImportResult,
    AgentSuggestRequest, AgentSuggestResponse, AgentSuggestion,
    MemoryGraph, MemoryGraphNode, MemoryGraphEdge, ResetDemoRequest,
)
from app.vault import vault, DECAY_CURVES
from app.nemotron import nemotron_client
from app.tavily_service import tavily_service
from app.seed_data import seed_vault
from app.conflicts import detect_conflicts
from app.crypto_sync import encrypt_vault_payload, decrypt_vault_payload
from app.logging_setup import configure_logging

configure_logging()

app = FastAPI(
    title="Receipts — Sovereign Memory Layer",
    description=(
        "A local-first assistant that gives every remembered fact a receipt — "
        "source, date, confidence, and staleness decay. "
        "Features: multi-user encrypted sync, conflict detection, staleness alerts, "
        "agentic memory suggestions, and memory graph visualization."
    ),
    version="2.0.0"
)

logger = logging.getLogger(__name__)

# Initialize seed data on startup
@app.on_event("startup")
def startup_event():
    seed_vault(vault)

# Mount static frontend
static_dir = BASE_DIR / "static"
static_dir.mkdir(parents=True, exist_ok=True)
(static_dir / "css").mkdir(parents=True, exist_ok=True)
(static_dir / "js").mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

@app.get("/")
def serve_index():
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "Receipts API v2.0 running. Visit /docs for OpenAPI specs."}


@app.get("/health")
def health_check():
    """Return a small local liveness/readiness check without exposing paths or secrets."""
    try:
        vault.get_stats()
        return {"status": "ok", "database": "ready"}
    except Exception:
        logger.exception("Health check could not read the local vault.")
        raise HTTPException(status_code=503, detail="Local vault unavailable.")

# ─── Memory Vault CRUD ────────────────────────────────────────────────────────

@app.get("/api/memories", response_model=List[MemoryReceipt])
def list_memories(
    category: Optional[str] = FastQuery(None),
    status: Optional[str] = FastQuery(None),
    search: Optional[str] = FastQuery(None)
):
    return vault.list_memories(category=category, status=status, search=search)

@app.get("/api/memories/{receipt_id}", response_model=MemoryReceipt)
def get_memory(receipt_id: str):
    mem = vault.get_memory(receipt_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return mem

@app.post("/api/memories", response_model=MemoryReceipt)
def create_memory(req: MemoryCreateRequest):
    return vault.add_memory(req)

@app.put("/api/memories/{receipt_id}/correct", response_model=MemoryReceipt)
def correct_memory(receipt_id: str, req: MemoryCorrectionRequest):
    mem = vault.correct_memory(
        receipt_id=receipt_id,
        new_content=req.new_content,
        reason=req.reason or "User sovereign correction",
        reset_confidence=req.reset_confidence or 0.98
    )
    if not mem:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return mem

@app.post("/api/memories/{receipt_id}/refresh", response_model=MemoryReceipt)
def refresh_memory(receipt_id: str):
    mem = vault.confirm_freshness(receipt_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return mem

@app.delete("/api/memories/{receipt_id}")
def delete_memory(receipt_id: str):
    success = vault.delete_memory(receipt_id)
    if not success:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return {"status": "success", "message": f"Receipt {receipt_id} permanently erased from sovereign local vault."}

# ─── Nemotron Reasoning & Chat Query ─────────────────────────────────────────

@app.post("/api/query", response_model=QueryResponse)
async def query_assistant(req: QueryRequest):
    all_mems = vault.list_memories()
    try:
        resp = await nemotron_client.answer_query(
            query=req.query,
            all_memories=all_mems,
            include_stale=req.include_stale,
            max_receipts=req.max_receipts
        )
    except (ValueError, RuntimeError) as live_err:
        # STRICT_LIVE_MODE: surface the error as HTTP 503 so it is never hidden
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Live Nemotron inference unavailable",
                "reason": str(live_err),
                "fix": (
                    "Check NEBIUS_API_KEY and the configured model ID for Nebius Token Factory. "
                    "No NVIDIA NIM endpoint is used."
                )
            }
        )

    # Run Nemotron Nano fact extraction after every live turn
    existing_ids = [m.id for m in all_mems]
    raw_facts = await nemotron_client.extract_facts_from_turn(
        user_message=req.query,
        assistant_answer=resp.answer,
        existing_receipt_ids=existing_ids,
    )
    extracted = []
    for f in raw_facts:
        try:
            extracted.append(NanoExtractedFact(
                content=str(f.get("content", ""))[:200],
                category=str(f.get("category", "preference")),
                decay_curve=str(f.get("decay_curve", "lifestyle_preference")),
                source_excerpt=str(f.get("source_excerpt", ""))[:300],
                confidence=float(f.get("confidence", 0.85)),
            ))
        except Exception:
            pass

    resp.extracted_facts = extracted
    return resp


@app.post("/api/memories/nano-save", response_model=list)
async def nano_save_facts(req: NanoSaveRequest):
    """Saves user-confirmed facts extracted by Nemotron Nano into the vault."""
    created = []
    for fact in req.facts:
        mem_req = MemoryCreateRequest(
            content=fact.content,
            category=fact.category,
            source_type="nemotron_nano_extraction",
            source_title=req.source_title,
            source_excerpt=fact.source_excerpt,
            initial_confidence=min(1.0, max(0.0, fact.confidence)),
            decay_curve=fact.decay_curve,
        )
        new_mem = vault.add_memory(mem_req)
        created.append(new_mem)
    return created

# ─── NEW: Memory Conflict Detection ──────────────────────────────────────────

@app.post("/api/conflicts/check", response_model=ConflictResult)
def check_conflicts(req: ConflictCheckRequest):
    """
    Checks whether a proposed fact statement conflicts with existing active memories.
    Uses semantic domain clustering and change-marker heuristics.
    Returns a list of conflict descriptors if contradictions are detected.
    """
    all_mems = vault.list_memories()
    # Convert to dict for conflict engine
    mems_as_dicts = [
        {
            "id": m.id,
            "content": m.content,
            "category": m.category,
            "status": m.status,
        }
        for m in all_mems
        if m.id != req.exclude_receipt_id
    ]
    conflicts = detect_conflicts(req.proposed_fact, mems_as_dicts)
    return ConflictResult(
        has_conflicts=len(conflicts) > 0,
        conflicts=conflicts,
        proposed_fact=req.proposed_fact,
    )

# ─── NEW: Staleness Alerts ────────────────────────────────────────────────────

@app.get("/api/alerts/staleness", response_model=List[StalenessAlert])
def get_staleness_alerts(
    min_risk: str = FastQuery("medium", description="Minimum risk level: low, medium, high")
):
    """
    Returns memories that are decaying or stale, ordered by urgency.
    Useful for proactive staleness notifications and agentic refresh prompts.
    """
    risk_order = {"low": 0, "medium": 1, "high": 2}
    min_risk_val = risk_order.get(min_risk.lower(), 1)

    all_mems = vault.list_memories()
    alerts: List[StalenessAlert] = []

    for m in all_mems:
        risk_val = risk_order.get(m.staleness_risk.lower(), 0)
        if m.status in ("decaying", "stale") and risk_val >= min_risk_val:
            if m.status == "stale":
                msg = f"⚠️ STALE: This memory has decayed below 40% confidence and is no longer used by the assistant."
                action = "Sovereign Forget or Correct Fact to reaffirm freshness"
            else:  # decaying
                msg = f"🔶 DECAYING: Confidence is {int(m.current_confidence * 100)}%. Confirm this is still true to reset the decay clock."
                action = "Click 'Fresh' to reaffirm, or 'Correct Fact' if outdated"

            alerts.append(StalenessAlert(
                receipt_id=m.id,
                fact_snippet=m.content[:100] + ("..." if len(m.content) > 100 else ""),
                status=m.status,
                days_since_confirmed=m.days_since_confirmed,
                staleness_risk=m.staleness_risk,
                current_confidence=m.current_confidence,
                decay_curve=m.decay_curve,
                message=msg,
                recommended_action=action,
            ))

    # Sort: stale > decaying, then by days_since_confirmed desc
    alerts.sort(key=lambda a: (0 if a.status == "stale" else 1, -a.days_since_confirmed))
    return alerts

# ─── NEW: Encrypted Cross-Device Sync ────────────────────────────────────────

@app.post("/api/sync/export")
def export_encrypted_vault(req: SyncExportRequest):
    """
    Exports the entire memory vault as an AES-256-GCM encrypted JSON bundle.
    The encrypted payload can be safely transferred to any device.
    Only someone with the correct passphrase can decrypt and import it.
    """
    all_mems = vault.list_memories()
    mems_data = []
    for m in all_mems:
        d = m.model_dump()
        if not req.include_audit_history:
            d["audit_history"] = []
        mems_data.append(d)

    vault_payload = {
        "user_id": req.user_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "memories": mems_data,
        "memory_count": len(mems_data),
        "format_version": "2.0",
    }

    try:
        encrypted = encrypt_vault_payload(vault_payload, req.passphrase)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "encrypted_bundle": encrypted,
        "message": (
            f"Exported {len(mems_data)} memories as AES-256-GCM encrypted bundle. "
            f"Transfer this JSON to another device and use POST /api/sync/import to restore."
        ),
    }


@app.post("/api/sync/import", response_model=SyncImportResult)
def import_encrypted_vault(req: SyncImportRequest):
    """
    Decrypts an encrypted vault bundle and imports memories into the local vault.
    Merge strategy:
    - skip_existing: only adds memories whose IDs don't already exist
    - overwrite: replaces existing memories with imported versions
    """
    try:
        payload = decrypt_vault_payload(req.encrypted_bundle, req.passphrase)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Decryption failed: {e}. Verify your passphrase and bundle integrity."
        )

    memories_data = payload.get("memories", [])
    user_id = payload.get("user_id", "unknown")
    imported = 0
    skipped = 0
    error_count = 0
    errors: List[str] = []

    existing_ids = {m.id for m in vault.list_memories()}

    for mem_dict in memories_data:
        receipt_id = mem_dict.get("id", "")
        try:
            if receipt_id in existing_ids:
                if req.merge_strategy == "skip_existing":
                    skipped += 1
                    continue
                # overwrite: delete then re-add
                vault.delete_memory(receipt_id)

            create_req = MemoryCreateRequest(
                content=mem_dict["content"],
                category=mem_dict.get("category", "preference"),
                source_type=mem_dict.get("source_type", "document"),
                source_title=mem_dict.get("source_title", "Sync Import"),
                source_excerpt=mem_dict.get("source_excerpt", ""),
                source_url=mem_dict.get("source_url"),
                initial_confidence=float(mem_dict.get("initial_confidence", 0.9)),
                decay_curve=mem_dict.get("decay_curve", "lifestyle_preference"),
                valid_until=mem_dict.get("valid_until"),
            )
            vault.add_memory(create_req)
            imported += 1
        except Exception as e:
            error_count += 1
            errors.append(f"Failed to import receipt {receipt_id}: {e}")

    return SyncImportResult(
        imported_count=imported,
        skipped_count=skipped,
        error_count=error_count,
        errors=errors[:10],  # cap error list
        user_id=user_id,
    )

# ─── NEW: Agentic Memory Tools ────────────────────────────────────────────────

@app.post("/api/agent/suggest", response_model=AgentSuggestResponse)
async def get_agent_suggestions(req: AgentSuggestRequest):
    """
    Agentic endpoint: asks Nemotron to analyze the vault and produce actionable suggestions:
    - refresh_alert: memories nearing staleness that should be reaffirmed
    - conflict_hint: potential contradictions between receipts
    - graph_cluster: semantically related memories that form a cluster
    - ask_user: recommended follow-up questions to strengthen provenance
    """
    all_mems = vault.list_memories()

    # Compute vault health score (weighted freshness ratio)
    if all_mems:
        fresh_weight = sum(1.0 for m in all_mems if m.status == "fresh")
        decay_weight = sum(0.5 for m in all_mems if m.status == "decaying")
        stale_weight = sum(0.0 for m in all_mems if m.status == "stale")
        health_score = (fresh_weight + decay_weight) / len(all_mems)
    else:
        health_score = 1.0

    raw_suggestions = await nemotron_client.generate_memory_suggestions(
        all_mems, user_context=req.user_context
    )

    suggestions: List[AgentSuggestion] = []
    for s in raw_suggestions[:req.max_suggestions]:
        try:
            suggestions.append(AgentSuggestion(
                type=str(s.get("type", "ask_user")),
                priority=str(s.get("priority", "medium")),
                receipt_ids=list(s.get("receipt_ids", [])),
                title=str(s.get("title", ""))[:80],
                description=str(s.get("description", ""))[:250],
                action=str(s.get("action", ""))[:200],
            ))
        except Exception:
            pass

    # Supplement with local rule-based suggestions if Nemotron returned nothing
    if not suggestions:
        stale_mems = [m for m in all_mems if m.status == "stale"]
        decaying_mems = [m for m in all_mems if m.status == "decaying"]
        for m in decaying_mems[:2]:
            suggestions.append(AgentSuggestion(
                type="refresh_alert",
                priority="high",
                receipt_ids=[m.id],
                title=f"Reaffirm: {m.content[:50]}...",
                description=f"Receipt #{m.id} is decaying ({int(m.current_confidence*100)}% confidence, {m.days_since_confirmed} days old). Verify if still true.",
                action=f"Click 'Fresh' on Receipt #{m.id} if still accurate, or 'Correct Fact' if outdated."
            ))
        for m in stale_mems[:2]:
            suggestions.append(AgentSuggestion(
                type="refresh_alert",
                priority="high",
                receipt_ids=[m.id],
                title=f"⚠️ Stale: {m.content[:50]}...",
                description=f"Receipt #{m.id} has decayed below 40% confidence ({m.days_since_confirmed} days since confirmed). Remove or correct.",
                action=f"Use 'Forget' to erase or 'Correct Fact' to update Receipt #{m.id}."
            ))

    model_info = (
        f"NVIDIA Nemotron ({settings.NEMOTRON_CHAT_MODEL}) via {settings.resolve_base_url()}"
        if suggestions and raw_suggestions
        else "Local rule-based analysis (no live API key)"
    )

    return AgentSuggestResponse(
        suggestions=suggestions,
        vault_health_score=round(health_score, 3),
        model_used=model_info,
    )

# ─── NEW: Memory Graph ────────────────────────────────────────────────────────

CATEGORY_COLORS = {
    "preference": "#6366f1",      # indigo
    "active_project": "#f59e0b",  # amber
    "factual_web": "#06b6d4",     # cyan
    "personal": "#10b981",        # emerald
    "project": "#f59e0b",
    "lifestyle_preference": "#6366f1",
}

@app.get("/api/graph", response_model=MemoryGraph)
def get_memory_graph():
    """
    Generates a memory knowledge graph with nodes (memories) and edges (semantic relationships).
    - Same category → light edge
    - Shared significant keywords (3+ words) → semantic edge
    - Detected conflict domain overlap → conflict edge (orange)
    """
    all_mems = vault.list_memories()
    nodes: List[MemoryGraphNode] = []
    edges: List[MemoryGraphEdge] = []

    for m in all_mems:
        color = CATEGORY_COLORS.get(m.category, "#94a3b8")
        nodes.append(MemoryGraphNode(
            id=m.id,
            label=f"#{m.id}: {m.content[:40]}...",
            category=m.category,
            status=m.status,
            confidence=m.current_confidence,
            size=max(10, m.current_confidence * 25),
            color=color if m.status != "stale" else "#475569",
        ))

    # Build edges: pairwise keyword overlap scoring
    stop_words = {"the", "and", "for", "with", "user", "that", "this", "from", "are", "was",
                  "has", "had", "have", "its", "not", "but", "will", "can", "all"}
    def sig_tokens(text: str) -> set:
        return {w.lower() for w in re.findall(r"\b[a-zA-Z]{4,}\b", text) if w.lower() not in stop_words}

    for i, m1 in enumerate(all_mems):
        for j, m2 in enumerate(all_mems):
            if j <= i:
                continue
            t1 = sig_tokens(f"{m1.content} {m1.source_title}")
            t2 = sig_tokens(f"{m2.content} {m2.source_title}")
            common = t1 & t2
            if not t1 or not t2:
                continue
            jaccard = len(common) / len(t1 | t2)

            if jaccard >= 0.15:
                # Determine relationship type
                if m1.category == m2.category:
                    rel = "same_category"
                else:
                    rel = "shared_keywords"

                edges.append(MemoryGraphEdge(
                    source=m1.id,
                    target=m2.id,
                    weight=round(jaccard, 3),
                    relationship=rel,
                ))

    return MemoryGraph(
        nodes=nodes,
        edges=edges,
        total_nodes=len(nodes),
        total_edges=len(edges),
    )

# ─── Tavily Web Search & Source Verification ─────────────────────────────────

@app.post("/api/tavily/ingest", response_model=MemoryReceipt)
async def tavily_search_ingest(req: TavilySearchIngestRequest):
    search_data = await tavily_service.search(req.query, max_results=1)
    results = search_data.get("results", [])
    if not results:
        raise HTTPException(status_code=404, detail="No search results returned from Tavily.")

    top = results[0]
    create_req = MemoryCreateRequest(
        content=f"Web fact: {top.get('content', '')[:180]}...",
        category=req.category,
        source_type="tavily_search",
        source_title=f"Tavily Search: {top.get('title', req.query)}",
        source_excerpt=top.get("content", "")[:350],
        source_url=top.get("url"),
        initial_confidence=float(top.get("score", 0.92)),
        decay_curve=req.decay_curve
    )
    new_mem = vault.add_memory(create_req)
    verification = await tavily_service.verify_source(
        new_mem.source_url or "", new_mem.source_excerpt, stored_hash=new_mem.source_hash
    )
    vault.update_tavily_verification(
        receipt_id=new_mem.id,
        status=verification.get("status", "unreachable"),
        details=verification.get("details", ""),
    )
    new_mem = vault.get_memory(new_mem.id)
    return new_mem

@app.post("/api/tavily/verify", response_model=TavilyVerifyResponse)
async def verify_memory_source(req: TavilyVerifyRequest):
    mem = vault.get_memory(req.receipt_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Receipt not found")

    res = await tavily_service.verify_source(
        mem.source_url or "", mem.source_excerpt, stored_hash=mem.source_hash
    )
    vault.update_tavily_verification(
        receipt_id=req.receipt_id,
        status=res.get("status", "unreachable"),
        details=res.get("details", "")
    )

    return TavilyVerifyResponse(
        receipt_id=req.receipt_id,
        status=res.get("status", "unreachable"),
        details=res.get("details", ""),
        matched_snippet=res.get("matched_snippet"),
        before_excerpt=mem.source_excerpt,
        after_excerpt=res.get("observed_excerpt"),
        verified_at=res.get("verified_at", "")
    )

# ─── Vault Stats & Meta ───────────────────────────────────────────────────────

@app.get("/api/stats", response_model=VaultStats)
def get_stats():
    return vault.get_stats()

@app.get("/api/decay-curves")
def get_decay_curves():
    return DECAY_CURVES

@app.get("/api/tombstones")
def get_tombstones():
    """Returns the deletion audit log: receipt IDs and timestamps of forgotten memories."""
    return vault.get_tombstones()

@app.get("/api/integrity")
def get_vault_integrity():
    """Verify receipt record digests and predecessor links without modifying the vault."""
    return vault.verify_integrity()

@app.get("/api/outbound-ledger")
def get_outbound_ledger(limit: int = FastQuery(50, ge=1, le=100)):
    """Return exact model request payloads stored locally, with no auth headers."""
    return {"requests": vault.list_outbound_requests(limit=limit)}

@app.post("/api/settings")
async def update_settings(req: SettingsUpdateRequest):
    if req.nemotron_model:
        try:
            available_models = await nemotron_client.list_available_models()
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Could not validate model against Nebius Token Factory.") from exc
        if req.nemotron_model not in available_models:
            raise HTTPException(status_code=422, detail="Select a model returned by Nebius Token Factory.")
    settings.update_keys(
        nebius_key=req.nebius_api_key,
        tavily_key=req.tavily_api_key,
        model=req.nemotron_model
    )
    nemotron_client.model = settings.NEMOTRON_CHAT_MODEL
    tavily_service.api_key = settings.TAVILY_API_KEY
    return {
        "status": "success",
        "has_nebius_key": bool(settings.NEBIUS_API_KEY),
        "has_tavily_key": bool(settings.TAVILY_API_KEY),
        "model": settings.NEMOTRON_CHAT_MODEL,
        "active_endpoint": nemotron_client.base_url,
        "provider": "NVIDIA NIM" if "integrate.api.nvidia.com" in nemotron_client.base_url else "Nebius Token Factory",
        "strict_live_mode": settings.STRICT_LIVE_MODE,
        "provider": "Nebius Token Factory",
    }

@app.get("/api/engine-status")
def get_engine_status():
    """Report configuration; credentials alone do not prove live inference is working."""
    key = settings.NEBIUS_API_KEY
    tavily_key = settings.TAVILY_API_KEY
    return {
        "has_api_key": bool(key and len(key) > 10),
        "key_display": "Configured" if key and len(key) > 10 else "Not configured",
        "has_tavily_key": bool(tavily_key and len(tavily_key) > 5),
        "tavily_display": "Configured" if tavily_key and len(tavily_key) > 5 else "Not configured",
        "active_endpoint": nemotron_client.base_url,
        "provider": "NVIDIA NIM" if "integrate.api.nvidia.com" in nemotron_client.base_url else "Nebius Token Factory",
        "chat_model": settings.NEMOTRON_CHAT_MODEL,
        "extract_model": settings.NEMOTRON_EXTRACT_MODEL,
        "strict_live_mode": settings.STRICT_LIVE_MODE,
        "is_live": False,
        "connection_verified": False,
        "state": "configured" if key and len(key) > 10 else "missing_key",
    }

@app.get("/api/models")
async def list_token_factory_models():
    """List live model IDs through the Nebius Token Factory models API."""
    try:
        models = await nemotron_client.list_available_models()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("Token Factory model list request failed (%s).", type(exc).__name__)
        raise HTTPException(status_code=503, detail="Nebius Token Factory model list is unavailable.") from exc
    provider = "NVIDIA NIM" if "integrate.api.nvidia.com" in nemotron_client.base_url else "Nebius Token Factory"
    return {"provider": provider, "models": models}

@app.post("/api/self-test")
async def run_demo_self_test():
    """Smoke-test local vault, encrypted sync, and configured external services with synthetic input."""
    checks = {}
    try:
        stats = vault.get_stats()
        checks["vault"] = {"status": "pass", "receipts": stats.total_memories}
    except Exception:
        logger.exception("Demo self-test vault check failed.")
        checks["vault"] = {"status": "fail", "message": "Local vault check failed."}

    try:
        probe = {"user_id": "self-test", "memories": [], "memory_count": 0}
        encrypted = encrypt_vault_payload(probe, "self-test-passphrase")
        decrypted = decrypt_vault_payload(encrypted, "self-test-passphrase")
        checks["sync"] = {"status": "pass" if decrypted == probe else "fail"}
    except Exception:
        logger.exception("Demo self-test sync check failed.")
        checks["sync"] = {"status": "fail", "message": "Encrypted sync round-trip failed."}

    if settings.NEBIUS_API_KEY:
        try:
            chat_result = await nemotron_client._call_nebius(
                system_prompt="Reply with exactly: RECEIPTS_SELF_TEST_OK",
                user_message="RECEIPTS_SELF_TEST",
                model=nemotron_client.model,
                max_tokens=20,
                temperature=0,
                fallback_model=settings.NEMOTRON_FALLBACK_MODEL,
            )
            checks["chat"] = {
                "status": "pass",
                "model": chat_result.model,
                "degraded": bool(chat_result.degraded_message),
            }
        except Exception as exc:
            logger.warning("Demo self-test Token Factory check failed (%s).", type(exc).__name__)
            checks["chat"] = {"status": "fail", "message": "Nebius Token Factory inference failed."}
    else:
        checks["chat"] = {"status": "skip", "message": "NEBIUS_API_KEY is not configured."}

    if tavily_service.api_key:
        result = await tavily_service.search("Nebius Token Factory service status", max_results=1)
        checks["tavily"] = {"status": "pass" if result.get("results") else "fail", "mode": "live"}
    else:
        checks["tavily"] = {"status": "skip", "message": "TAVILY_API_KEY is not configured."}

    statuses = [check["status"] for check in checks.values()]
    return {"status": "pass" if all(s == "pass" for s in statuses) else "partial", "checks": checks}

@app.post("/api/reset-demo")
def reset_demo(req: ResetDemoRequest):
    if not req.confirmed:
        raise HTTPException(status_code=400, detail="Confirm before resetting demo data.")
    seed_vault(vault, force_reset=True)
    return {"status": "success", "message": "Vault successfully reset to default demo receipts."}
