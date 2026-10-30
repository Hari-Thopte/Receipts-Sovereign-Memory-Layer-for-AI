import json
import hashlib
from datetime import datetime, timezone, timedelta
from app.vault import LocalVault
from app.models import AuditEntry

def seed_vault(vault: LocalVault, force_reset: bool = False):
    """Seeds the vault with rich realistic memories demonstrating provenance, decay curves, and Tavily verification."""
    with vault._get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM memories")
        count = cursor.fetchone()[0]
        if force_reset:
            cursor.execute("DELETE FROM memories")
            conn.commit()
    add_conflict_seed = count > 0 and not force_reset

    now = datetime.now(timezone.utc)

    seed_items = [
        {
            "id": "REC-ASYNC1",
            "content": "User strictly prefers asynchronous communication for sprint planning and updates, avoiding recurring morning meetings.",
            "category": "preference",
            "source_type": "email",
            "source_title": "Email Thread: Q4 Sprint Cadence & Team Norms",
            "source_excerpt": "From: Hari <hari@company.org>\nDate: 2026-10-12\nSubject: Re: Sprint cadence\n\n'Please do not book recurring morning standup calls for sprint planning. I strongly prefer async communication in our dedicated channel with written updates.'",
            "source_url": None,
            "initial_confidence": 0.95,
            "created_at": (now - timedelta(days=14)).isoformat(),
            "last_confirmed_at": (now - timedelta(days=5)).isoformat(),
            "valid_until": None,
            "decay_curve": "lifestyle_preference",
            "tavily_verified_at": None,
            "tavily_verify_status": None,
            "tavily_verify_details": None,
            "audit_history": [
                {
                    "timestamp": (now - timedelta(days=14)).isoformat(),
                    "action": "created",
                    "new_content": "User strictly prefers asynchronous communication for sprint planning and updates, avoiding recurring morning meetings.",
                    "reason": "Ingested from Q4 cadence email",
                    "performed_by": "system"
                },
                {
                    "timestamp": (now - timedelta(days=5)).isoformat(),
                    "action": "refreshed",
                    "new_content": "User strictly prefers asynchronous communication for sprint planning and updates, avoiding recurring morning meetings.",
                    "reason": "Reaffirmed during weekly review",
                    "performed_by": "user"
                }
            ]
        },
        {
            "id": "REC-RUST2",
            "content": "Active engineering sprint goal is migrating the telemetry and auth microservices to Rust.",
            "category": "project",
            "source_type": "slack",
            "source_title": "Slack Channel #dev-standup (Sprint 42)",
            "source_excerpt": "hari [10:42 AM]: 'Wrapping up Python profiling today. Moving 100% of my sprint bandwidth to the Rust rewrite of auth & telemetry microservices.'",
            "source_url": None,
            "initial_confidence": 0.90,
            "created_at": (now - timedelta(days=6)).isoformat(),
            "last_confirmed_at": (now - timedelta(days=6)).isoformat(),
            "valid_until": None,
            "decay_curve": "active_project",
            "tavily_verified_at": None,
            "tavily_verify_status": None,
            "tavily_verify_details": None,
            "audit_history": [
                {
                    "timestamp": (now - timedelta(days=6)).isoformat(),
                    "action": "created",
                    "new_content": "Active engineering sprint goal is migrating the telemetry and auth microservices to Rust.",
                    "reason": "Logged from Slack standup channel",
                    "performed_by": "system"
                }
            ]
        },
        {
            "id": "REC-NEMO3",
            "content": "Nebius Token Factory provides OpenAI-compatible API access to NVIDIA Nemotron-3 Super 120B-a12b and Nemotron-3 Nano.",
            "category": "factual_web",
            "source_type": "tavily_search",
            "source_title": "Nebius Token Factory Model Catalog",
            "source_excerpt": "Use this catalog to compare public models available in Nebius Token Factory. It includes model names, model IDs, providers, regions, context windows and pricing values for inference, embeddings and reranking.",
            "source_url": "https://tokenfactory.nebius.com/model-catalog.md",
            "initial_confidence": 0.98,
            "created_at": (now - timedelta(days=1)).isoformat(),
            "last_confirmed_at": (now - timedelta(days=1)).isoformat(),
            "valid_until": None,
            "decay_curve": "transient_state",
            "tavily_verified_at": None,
            "tavily_verify_status": None,
            "tavily_verify_details": None,
            "audit_history": [
                {
                    "timestamp": (now - timedelta(days=1)).isoformat(),
                    "action": "created",
                    "new_content": "Nebius Token Factory provides OpenAI-compatible API access to NVIDIA Nemotron-3 Super 120B-a12b and Nemotron-3 Nano.",
                    "reason": "Ingested via Tavily web search",
                    "performed_by": "tavily"
                }
            ]
        },
        {
            "id": "REC-PST4",
            "content": "User is based in Seattle, Washington and operates on Pacific Time (PST/PDT, UTC-8/UTC-7).",
            "category": "personal",
            "source_type": "document",
            "source_title": "Team Onboarding Bio (2026-08-15)",
            "source_excerpt": "Location: Seattle, WA. Working hours: 09:30 - 17:30 PST. Primary contact: Slack.",
            "source_url": None,
            "initial_confidence": 0.92,
            "created_at": (now - timedelta(days=72)).isoformat(),
            "last_confirmed_at": (now - timedelta(days=72)).isoformat(),
            "valid_until": None,
            "decay_curve": "lifestyle_preference",
            "tavily_verified_at": None,
            "tavily_verify_status": None,
            "tavily_verify_details": None,
            "audit_history": [
                {
                    "timestamp": (now - timedelta(days=72)).isoformat(),
                    "action": "created",
                    "new_content": "User is based in Seattle, Washington and operates on Pacific Time (PST/PDT, UTC-8/UTC-7).",
                    "reason": "Extracted from onboarding doc",
                    "performed_by": "system"
                }
            ]
        },
        {
            "id": "REC-AUS7",
            "content": "User moved to Austin, Texas and now operates on Central Time (CST/CDT, UTC-6/UTC-5).",
            "category": "personal",
            "source_type": "chat",
            "source_title": "Profile Update Chat (2026-10-27)",
            "source_excerpt": "I moved to Austin, Texas; please use Central Time for scheduling.",
            "source_url": None,
            "initial_confidence": 1.0,
            "created_at": (now - timedelta(days=3)).isoformat(),
            "last_confirmed_at": (now - timedelta(days=3)).isoformat(),
            "valid_until": None,
            "decay_curve": "lifestyle_preference",
            "tavily_verified_at": None,
            "tavily_verify_status": None,
            "tavily_verify_details": None,
            "audit_history": [
                {
                    "timestamp": (now - timedelta(days=3)).isoformat(),
                    "action": "created",
                    "new_content": "User moved to Austin, Texas and now operates on Central Time (CST/CDT, UTC-6/UTC-5).",
                    "reason": "Seeded example of a newer conflicting location update",
                    "performed_by": "system"
                }
            ]
        },
        {
            "id": "REC-COFFEE5",
            "content": "User drinks oat milk lattes and strictly avoids dairy due to lactose intolerance.",
            "category": "preference",
            "source_type": "chat",
            "source_title": "Direct Chat Statement (Office Caterer Q&A)",
            "source_excerpt": "'Oat milk only please for my lattes, strong dairy intolerance.' - Hari in kitchen survey chat",
            "source_url": None,
            "initial_confidence": 0.96,
            "created_at": (now - timedelta(days=40)).isoformat(),
            "last_confirmed_at": (now - timedelta(days=4)).isoformat(),
            "valid_until": None,
            "decay_curve": "lifestyle_preference",
            "tavily_verified_at": None,
            "tavily_verify_status": None,
            "tavily_verify_details": None,
            "audit_history": [
                {
                    "timestamp": (now - timedelta(days=40)).isoformat(),
                    "action": "created",
                    "new_content": "User drinks oat milk lattes and strictly avoids dairy due to lactose intolerance.",
                    "reason": "Survey statement",
                    "performed_by": "system"
                }
            ]
        },
        {
            "id": "REC-STALE6",
            "content": "User's temporary roaming conference contact number is +1 (206) 555-0199 (valid until Oct 15, 2026).",
            "category": "personal",
            "source_type": "document",
            "source_title": "SF Summit Travel Itinerary Excerpt",
            "source_excerpt": "Temporary roaming SIM assigned for SF Summit: +1 (206) 555-0199. Valid active period: Oct 01, 2026 - Oct 15, 2026.",
            "source_url": None,
            "initial_confidence": 0.85,
            "created_at": (now - timedelta(days=26)).isoformat(),
            "last_confirmed_at": (now - timedelta(days=26)).isoformat(),
            "valid_until": (now - timedelta(days=11)).isoformat(),
            "decay_curve": "transient_state",
            "tavily_verified_at": None,
            "tavily_verify_status": None,
            "tavily_verify_details": None,
            "audit_history": [
                {
                    "timestamp": (now - timedelta(days=26)).isoformat(),
                    "action": "created",
                    "new_content": "User's temporary roaming conference contact number is +1 (206) 555-0199 (valid until Oct 15, 2026).",
                    "reason": "Travel itinerary upload",
                    "performed_by": "system"
                }
            ]
        }
    ]

    with vault._get_connection() as conn:
        cursor = conn.cursor()
        for item in seed_items:
            if add_conflict_seed and item["id"] != "REC-AUS7":
                continue
            if add_conflict_seed:
                cursor.execute("SELECT 1 FROM memories WHERE id = ?", (item["id"],))
                if cursor.fetchone():
                    continue
            s_hash = hashlib.sha256(item["source_excerpt"].strip().encode("utf-8")).hexdigest()
            cursor.execute("""
                INSERT OR REPLACE INTO memories (
                    id, content, category, source_type, source_title, source_excerpt,
                    source_url, initial_confidence, created_at, last_confirmed_at,
                    valid_until, decay_curve, tavily_verified_at, tavily_verify_status,
                    tavily_verify_details, source_hash, audit_history
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item["id"],
                item["content"],
                item["category"],
                item["source_type"],
                item["source_title"],
                item["source_excerpt"],
                item["source_url"],
                item["initial_confidence"],
                item["created_at"],
                item["last_confirmed_at"],
                item["valid_until"],
                item["decay_curve"],
                item["tavily_verified_at"],
                item["tavily_verify_status"],
                item["tavily_verify_details"],
                s_hash,
                json.dumps(item["audit_history"])
            ))
        conn.commit()
    vault.rebuild_hash_chain()
