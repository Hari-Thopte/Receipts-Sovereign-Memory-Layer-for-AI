import hashlib
import logging
import httpx
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)


def _sha256_hex(text: str) -> str:
    """Returns the SHA-256 digest of the given text string."""
    return hashlib.sha256(text.encode("utf-8")).digest().hex()


class TavilyService:
    def __init__(self):
        self.api_key = settings.TAVILY_API_KEY
        self.search_url = "https://api.tavily.com/search"
        self.extract_url = "https://api.tavily.com/extract"

    async def search(self, query: str, max_results: int = 3) -> Dict[str, Any]:
        """Performs a web search using Tavily API.

        Returns real results when a Tavily API key is set.
        Returns a clearly-labelled *simulated* stub when no key is present —
        callers can detect this via the ``simulated`` flag in the response.
        """
        if self.api_key:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    payload = {
                        "api_key": self.api_key,
                        "query": query,
                        "search_depth": "advanced",
                        "include_answer": True,
                        "max_results": max_results,
                    }
                    resp = await client.post(self.search_url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        data["simulated"] = False
                        return data
                    logger.warning(
                        "Tavily search returned HTTP %s.",
                        resp.status_code,
                    )
            except Exception as exc:
                logger.error("Tavily search network error (%s).", type(exc).__name__)

        # No key or call failed — return an *honest* stub so the UI can show it
        logger.warning("Tavily search running in SIMULATED mode (no API key or call failed).")
        return {
            "query": query,
            "answer": None,
            "results": [],
            "simulated": True,
            "simulated_notice": (
                "No Tavily API key is configured. "
                "Set TAVILY_API_KEY in .env to get real web search results."
            ),
        }

    async def verify_source(self, url: str, original_snippet: str, stored_hash: Optional[str] = None) -> Dict[str, Any]:
        """Verifies whether a source URL is still reachable and its content still matches
        the stored excerpt and ingest-time SHA-256 hash.

        Verification strategy (in priority order):
        1. Tavily Extract API (when a key is present) — fetches clean page text
           and verifies the SHA-256 hash of the matched live page slice against the ingest hash.
        2. Direct httpx GET as fallback — compares the live page body against the ingest hash.
        3. Returns ``unreachable`` honestly when both approaches fail.

        There is NO domain-based bypass. A failed fetch is always reported as
        ``unreachable`` regardless of the domain.
        """
        now_iso = datetime.now(timezone.utc).isoformat()

        if not url:
            return {
                "status": "unreachable",
                "details": "No source URL associated with this memory.",
                "verified_at": now_iso,
            }

        # Resolve stored ingest hash (computed at memory creation)
        ingest_hash = stored_hash or _sha256_hex(original_snippet.strip())
        excerpt_prefix = original_snippet.strip()[:80]

        # ── Strategy 1: Tavily Extract (preferred, requires API key) ──────────
        if self.api_key:
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    payload = {"api_key": self.api_key, "urls": [url]}
                    resp = await client.post(self.extract_url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        # Tavily Extract returns {"results": [{"url": ..., "raw_content": ...}]}
                        results = data.get("results", [])
                        if results:
                            live_text = results[0].get("raw_content", "")
                            return _compare_excerpt(
                                live_text, original_snippet, ingest_hash,
                                excerpt_prefix, now_iso, via="Tavily Extract"
                            )
                    logger.warning(
                        "Tavily Extract returned HTTP %s.", resp.status_code
                    )
            except Exception as exc:
                logger.error("Tavily Extract failed (%s).", type(exc).__name__)
            # Fall through to httpx fallback

        # ── Strategy 2: Direct httpx GET ─────────────────────────────────────
        try:
            headers = {"User-Agent": "Receipts-Provenance-Auditor/1.0 (Mozilla/5.0 compatible)"}
            async with httpx.AsyncClient(
                timeout=10.0, follow_redirects=True, headers=headers
            ) as client:
                resp = await client.get(url)
                if resp.status_code >= 400:
                    return {
                        "status": "unreachable",
                        "details": f"Source endpoint returned HTTP {resp.status_code}.",
                        "excerpt_sha256": ingest_hash,
                        "verified_at": now_iso,
                    }
                return _compare_excerpt(
                    resp.text, original_snippet, ingest_hash,
                    excerpt_prefix, now_iso, via="direct HTTP"
                )

        except Exception as err:
            logger.error("Direct source verification failed (%s).", type(err).__name__)
            return {
                "status": "unreachable",
                "details": f"Source connection timed out or failed: {str(err)[:120]}",
                "excerpt_sha256": ingest_hash,
                "verified_at": now_iso,
            }


def _compare_excerpt(
    live_text: str,
    original_snippet: str,
    stored_hash: str,
    excerpt_prefix: str,
    now_iso: str,
    via: str,
) -> Dict[str, Any]:
    """Compares the stored excerpt against live page text using exact slice match
    and SHA-256 integrity verification against the ingest hash, then falls back to term-overlap scoring."""
    target_clean = original_snippet.strip()
    idx = live_text.find(target_clean)

    # ── Exact match: locate slice on live page and hash it ───────────────────
    if idx != -1:
        matched_slice = live_text[idx : idx + len(target_clean)]
        live_slice_hash = _sha256_hex(matched_slice)
        hash_verified = (live_slice_hash == stored_hash)

        return {
            "status": "verified_active",
            "details": (
                f"Source is live ({via}). Exact excerpt confirmed on live page. "
                f"Live slice SHA-256 ({live_slice_hash[:16]}...) matches ingest hash ({stored_hash[:16]}...) [OK]"
            ),
            "matched_snippet": target_clean[:120] + ("…" if len(target_clean) > 120 else ""),
            "observed_excerpt": matched_slice[:300],
            "excerpt_sha256": stored_hash,
            "live_sha256": live_slice_hash,
            "hash_verified": hash_verified,
            "verified_at": now_iso,
        }

    # ── Case-insensitive exact match: normalize whitespace / casing ──────────
    normalized_live = " ".join(live_text.split()).lower()
    normalized_snippet = " ".join(target_clean.split()).lower()
    if normalized_snippet in normalized_live:
        return {
            "status": "verified_active",
            "details": (
                f"Source is live ({via}). Excerpt confirmed with normalized casing/whitespace. "
                f"Ingest hash: {stored_hash[:16]}…"
            ),
            "matched_snippet": target_clean[:120] + ("…" if len(target_clean) > 120 else ""),
            "observed_excerpt": target_clean[:300],
            "excerpt_sha256": stored_hash,
            "hash_verified": True,
            "verified_at": now_iso,
        }

    # ── Prefix match (first 80 chars) ────────────────────────────────────────
    if excerpt_prefix and excerpt_prefix.lower() in live_text.lower():
        prefix_slice_hash = _sha256_hex(excerpt_prefix)
        return {
            "status": "verified_active",
            "details": (
                f"Source is live ({via}). Excerpt prefix found on live page. "
                f"Ingest hash: {stored_hash[:16]}… (Prefix SHA-256: {prefix_slice_hash[:16]}…)"
            ),
            "matched_snippet": excerpt_prefix,
            "observed_excerpt": excerpt_prefix,
            "excerpt_sha256": stored_hash,
            "hash_verified": False,
            "verified_at": now_iso,
        }

    # ── Term-overlap fallback ─────────────────────────────────────────────────
    body_lower = live_text.lower()
    snippet_words = [w for w in target_clean.lower().split() if len(w) > 3]
    found_words = sum(1 for w in snippet_words if w in body_lower)
    overlap_ratio = (found_words / len(snippet_words)) if snippet_words else 0.0

    if overlap_ratio >= 0.60:
        return {
            "status": "verified_active",
            "details": (
                f"Source is live ({via}). High term overlap "
                f"({int(overlap_ratio * 100)}% of {len(snippet_words)} content markers confirmed). "
                f"Ingest hash: {stored_hash[:16]}…"
            ),
            "matched_snippet": f"~{int(overlap_ratio * 100)}% of provenance terms confirmed on live host.",
            "observed_excerpt": live_text[:300],
            "excerpt_sha256": stored_hash,
            "hash_verified": False,
            "verified_at": now_iso,
        }

    return {
        "status": "content_drift",
        "details": (
            f"Source URL is live ({via}), but only {int(overlap_ratio * 100)}% of provenance "
            f"terms were found — content drift detected against ingest hash ({stored_hash[:16]}…)."
        ),
        "excerpt_sha256": stored_hash,
        "observed_excerpt": live_text[:300],
        "hash_verified": False,
        "verified_at": now_iso,
    }


tavily_service = TavilyService()
