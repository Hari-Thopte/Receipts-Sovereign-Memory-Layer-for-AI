"""
app/conflicts.py
================
Semantic conflict detection and memory resolution engine.

Detects contradictions, shifts in user preference, and opposing facts
between newly proposed memories and existing receipts in the sovereign vault.
"""

import re
from typing import List, Dict, Any, Optional

# Antonym and polarity pairs for domain-specific conflict recognition
CONFLICT_CLUSTERS = [
    {
        "domain": "communication_style",
        "keywords": ["async", "asynchronous", "sync", "synchronous", "meeting", "calls", "standup"],
        "opposing": [
            ({"async", "asynchronous"}, {"sync", "synchronous", "live", "call", "calls", "in-person"}),
            ({"no meetings", "avoid calls", "hate meetings"}, {"daily sync", "morning sync", "standup"}),
        ]
    },
    {
        "domain": "beverage_diet",
        "keywords": ["coffee", "espresso", "latte", "cappuccino", "tea", "matcha", "decaf"],
        "opposing": [
            ({"drip coffee", "filter coffee"}, {"espresso", "ristretto", "decaf"}),
            ({"oat milk"}, {"dairy milk", "whole milk", "almond milk"}),
            ({"strict vegan"}, {"dairy", "meat", "fish"}),
            ({"allergic"}, {"eats", "eats daily", "favorite"})
        ]
    },
    {
        "domain": "location_workplace",
        "keywords": ["remote", "office", "onsite", "hybrid", "timezone", "pst", "est", "gmt", "ist"],
        "opposing": [
            ({"strictly remote", "100% remote"}, {"onsite", "in-office", "hq"}),
            ({"pst", "pacific"}, {"est", "eastern", "ist", "gmt", "cet"})
        ]
    },
    {
        "domain": "tech_stack_priority",
        "keywords": ["rust", "python", "go", "typescript", "c++"],
        "opposing": [
            ({"rewrite in rust", "focus on rust"}, {"postpone rust", "stick with python", "rewrite in go"})
        ]
    }
]

# Explicit temporal / polarity shift indicators
CHANGE_MARKERS = [
    "now prefers", "recently switched", "instead of", "no longer", "stopped",
    "updated to", "changed to", "rather than", "prefers over", "discontinued",
    "transitioned to", "moved away from", "has changed", "no longer uses"
]


def _clean_tokens(text: str) -> set:
    words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
    stop_words = {"the", "and", "for", "with", "user", "strictly", "that", "this", "from"}
    return {w for w in words if w not in stop_words}


def detect_conflicts(proposed_fact: str, existing_memories: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Compares proposed_fact against active (non-stale) memories.
    Returns list of conflict descriptor dicts if contradiction or preference shift is detected.
    """
    conflicts = []
    prop_lower = proposed_fact.lower()
    prop_tokens = _clean_tokens(proposed_fact)

    has_change_marker = any(m in prop_lower for m in CHANGE_MARKERS)

    for mem in existing_memories:
        # Ignore stale memories when checking active conflicts
        if mem.get("status") == "stale":
            continue

        existing_content = mem.get("content", "")
        existing_lower = existing_content.lower()
        existing_tokens = _clean_tokens(existing_content)

        # 1. Overlap in subject matter
        common_tokens = prop_tokens.intersection(existing_tokens)
        if len(common_tokens) < 1:
            continue

        # 2. Check predefined domain conflict clusters
        matched_cluster = False
        for cluster in CONFLICT_CLUSTERS:
            # Check if both texts touch this cluster
            prop_has_cluster = any(k in prop_lower for k in cluster["keywords"])
            exist_has_cluster = any(k in existing_lower for k in cluster["keywords"])

            if prop_has_cluster and exist_has_cluster:
                # Check opposing sets
                for set_a, set_b in cluster["opposing"]:
                    a_in_prop = any(item in prop_lower for item in set_a)
                    b_in_exist = any(item in existing_lower for item in set_b)
                    b_in_prop = any(item in prop_lower for item in set_b)
                    a_in_exist = any(item in existing_lower for item in set_a)

                    if (a_in_prop and b_in_exist) or (b_in_prop and a_in_exist):
                        conflicts.append({
                            "conflicting_receipt_id": mem.get("id"),
                            "conflicting_fact": existing_content,
                            "proposed_fact": proposed_fact,
                            "domain": cluster["domain"],
                            "reason": f"Direct preference contradiction detected in {cluster['domain'].replace('_', ' ')}.",
                            "severity": "high",
                            "common_keywords": list(common_tokens),
                            "recommended_action": "supersede"
                        })
                        matched_cluster = True
                        break
            if matched_cluster:
                break

        if matched_cluster:
            continue

        # 3. Explicit Change Marker heuristic on overlapping topic
        if has_change_marker and len(common_tokens) >= 2:
            conflicts.append({
                "conflicting_receipt_id": mem.get("id"),
                "conflicting_fact": existing_content,
                "proposed_fact": proposed_fact,
                "domain": "general_preference",
                "reason": f"Statement contains preference shift marker referencing existing fact terms: {', '.join(list(common_tokens)[:3])}.",
                "severity": "medium",
                "common_keywords": list(common_tokens),
                "recommended_action": "supersede"
            })

    return conflicts
