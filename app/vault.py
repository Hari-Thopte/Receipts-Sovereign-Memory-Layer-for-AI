import sqlite3
import json
import math
import uuid
import hashlib
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any
from app.config import settings
from app.models import MemoryReceipt, AuditEntry, VaultStats, MemoryCreateRequest

# Decay configuration: Half-life in days
DECAY_CURVES = {
    "lifestyle_preference": {
        "name": "Lifestyle & Preference",
        "half_life_days": 90.0,
        "description": "Slow decay (dietary, values, working style)"
    },
    "active_project": {
        "name": "Active Project & Sprint",
        "half_life_days": 21.0,
        "description": "Medium decay (current tasks, architecture focus, milestones)"
    },
    "transient_state": {
        "name": "Transient & Web Research",
        "half_life_days": 7.0,
        "description": "Fast decay (travel, web search facts, ephemeral prices)"
    }
}

class LocalVault:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = Path(db_path or settings.VAULT_DB_PATH)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA secure_delete = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    category TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_title TEXT NOT NULL,
                    source_excerpt TEXT NOT NULL,
                    source_url TEXT,
                    initial_confidence REAL NOT NULL DEFAULT 0.90,
                    created_at TEXT NOT NULL,
                    last_confirmed_at TEXT NOT NULL,
                    valid_until TEXT,
                    decay_curve TEXT NOT NULL DEFAULT 'lifestyle_preference',
                    tavily_verified_at TEXT,
                    tavily_verify_status TEXT,
                    tavily_verify_details TEXT,
                    source_hash TEXT,
                    previous_hash TEXT,
                    receipt_hash TEXT,
                    audit_history TEXT NOT NULL DEFAULT '[]'
                )
            """)
            # Migration check: ensure source_hash column exists on existing databases
            cursor.execute("PRAGMA table_info(memories)")
            columns = [col[1] for col in cursor.fetchall()]
            if "source_hash" not in columns:
                cursor.execute("ALTER TABLE memories ADD COLUMN source_hash TEXT")
            if "previous_hash" not in columns:
                cursor.execute("ALTER TABLE memories ADD COLUMN previous_hash TEXT")
            if "receipt_hash" not in columns:
                cursor.execute("ALTER TABLE memories ADD COLUMN receipt_hash TEXT")
            # Tombstone table: records that a receipt existed and was deliberately
            # forgotten.  Stores only the receipt ID and deletion timestamp —
            # NO content — so the audit trail can confirm sovereign deletion without
            # preserving what was deleted.  This reconciles "auditable" with "forgettable".
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tombstones (
                    receipt_id TEXT PRIMARY KEY,
                    deleted_at TEXT NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS outbound_ledger (
                    request_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    model TEXT NOT NULL,
                    request_payload TEXT NOT NULL,
                    outcome TEXT NOT NULL DEFAULT 'pending',
                    latency_ms INTEGER
                )
            """)
            conn.commit()
        self._initialize_hash_chain()

    @staticmethod
    def _receipt_digest(row: Dict[str, Any]) -> str:
        """Hash a canonical receipt record and its predecessor reference."""
        included = (
            "id", "content", "category", "source_type", "source_title", "source_excerpt",
            "source_url", "initial_confidence", "created_at", "last_confirmed_at",
            "valid_until", "decay_curve", "tavily_verified_at", "tavily_verify_status",
            "tavily_verify_details", "source_hash", "audit_history", "previous_hash",
        )
        payload = {key: row.get(key) for key in included}
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _initialize_hash_chain(self) -> None:
        """Backfill only legacy rows with no chain at all; never repair a partial chain."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT receipt_hash FROM memories").fetchall()
        if rows and all(row["receipt_hash"] is None for row in rows):
            self.rebuild_hash_chain()

    def rebuild_hash_chain(self) -> None:
        """Recompute the receipt chain after an authorized application mutation."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM memories ORDER BY created_at ASC, id ASC").fetchall()
            previous_hash = "GENESIS"
            for row in rows:
                data = dict(row)
                data["previous_hash"] = previous_hash
                digest = self._receipt_digest(data)
                conn.execute(
                    "UPDATE memories SET previous_hash = ?, receipt_hash = ? WHERE id = ?",
                    (previous_hash, digest, data["id"]),
                )
                previous_hash = digest
            conn.commit()

    def verify_integrity(self) -> Dict[str, Any]:
        """Check predecessor links and record hashes without changing stored data."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM memories ORDER BY created_at ASC, id ASC").fetchall()
        previous_hash = "GENESIS"
        for row in rows:
            data = dict(row)
            expected_hash = self._receipt_digest(data)
            if data.get("previous_hash") != previous_hash or data.get("receipt_hash") != expected_hash:
                return {
                    "valid": False,
                    "receipts_checked": len(rows),
                    "failed_receipt_id": data.get("id"),
                }
            previous_hash = data["receipt_hash"]
        return {"valid": True, "receipts_checked": len(rows), "failed_receipt_id": None}

    def record_outbound_request(self, model: str, endpoint: str, payload: Dict[str, Any]) -> str:
        """Persist the exact model request context locally, excluding auth headers."""
        request_id = f"OUT-{uuid.uuid4().hex[:12].upper()}"
        created_at = datetime.now(timezone.utc).isoformat()
        request_payload = json.dumps(
            {"endpoint": endpoint, **payload}, ensure_ascii=False, sort_keys=True
        )
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO outbound_ledger (request_id, created_at, model, request_payload) VALUES (?, ?, ?, ?)",
                (request_id, created_at, model, request_payload),
            )
            conn.commit()
        return request_id

    def update_outbound_request(self, request_id: str, outcome: str, latency_ms: int) -> None:
        """Record request completion metadata without copying provider response content."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE outbound_ledger SET outcome = ?, latency_ms = ? WHERE request_id = ?",
                (outcome, latency_ms, request_id),
            )
            conn.commit()

    def list_outbound_requests(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Return recent exact request contexts for the local outbound-data ledger."""
        safe_limit = max(1, min(int(limit), 100))
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM outbound_ledger ORDER BY created_at DESC LIMIT ?", (safe_limit,)
            ).fetchall()
        return [
            {
                "request_id": row["request_id"],
                "created_at": row["created_at"],
                "model": row["model"],
                "request": json.loads(row["request_payload"]),
                "outcome": row["outcome"],
                "latency_ms": row["latency_ms"],
            }
            for row in rows
        ]

    @staticmethod
    def _parse_iso(iso_str: str) -> datetime:
        try:
            return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        except Exception:
            return datetime.now(timezone.utc)

    @classmethod
    def calculate_decay(cls, memory_row: Dict[str, Any], current_time: Optional[datetime] = None) -> Dict[str, Any]:
        """Calculates decay, confidence, status, and staleness risk based on half-life model."""
        now = current_time or datetime.now(timezone.utc)
        last_confirmed = cls._parse_iso(memory_row["last_confirmed_at"])
        delta_days = max(0.0, (now - last_confirmed).total_seconds() / 86400.0)

        decay_curve = memory_row.get("decay_curve", "lifestyle_preference")
        curve_info = DECAY_CURVES.get(decay_curve, DECAY_CURVES["lifestyle_preference"])
        half_life = curve_info["half_life_days"]

        # Exponential decay: C(t) = C0 * e^(-lambda * delta_days)
        decay_lambda = math.log(2) / half_life
        decay_factor = math.exp(-decay_lambda * delta_days)

        initial_conf = float(memory_row["initial_confidence"])
        current_conf = max(0.05, min(1.0, initial_conf * decay_factor))

        # Check explicit valid_until
        is_expired = False
        if memory_row.get("valid_until"):
            valid_dt = cls._parse_iso(memory_row["valid_until"])
            if now > valid_dt:
                is_expired = True
                current_conf = min(current_conf, 0.20)

        # Status & Staleness risk assignment
        if is_expired or current_conf < 0.40:
            status = "stale"
            staleness_risk = "high"
        elif current_conf < 0.75:
            status = "decaying"
            staleness_risk = "medium"
        else:
            status = "fresh"
            staleness_risk = "low"

        return {
            "current_confidence": round(current_conf, 2),
            "status": status,
            "staleness_risk": staleness_risk,
            "days_since_confirmed": int(delta_days)
        }

    def _row_to_model(self, row: sqlite3.Row) -> MemoryReceipt:
        data = dict(row)
        decay_data = self.calculate_decay(data)
        data.update(decay_data)
        
        # Parse audit history
        audit_raw = data.get("audit_history") or "[]"
        try:
            audit_list = json.loads(audit_raw)
            data["audit_history"] = [AuditEntry(**entry) for entry in audit_list]
        except Exception:
            data["audit_history"] = []

        # Ensure source_hash is populated
        if not data.get("source_hash"):
            excerpt_text = data.get("source_excerpt", "")
            data["source_hash"] = hashlib.sha256(excerpt_text.strip().encode("utf-8")).hexdigest()

        return MemoryReceipt(**data)

    def list_memories(self, category: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None) -> List[MemoryReceipt]:
        query = "SELECT * FROM memories ORDER BY created_at DESC"
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query)
            rows = cursor.fetchall()

        results = []
        for r in rows:
            model = self._row_to_model(r)
            if category and category != "all" and model.category.lower() != category.lower():
                continue
            if status and status != "all" and model.status.lower() != status.lower():
                continue
            if search:
                s_lower = search.lower()
                text_to_search = f"{model.content} {model.source_title} {model.source_excerpt}".lower()
                if s_lower not in text_to_search:
                    continue
            results.append(model)
        return results

    def get_memory(self, receipt_id: str) -> Optional[MemoryReceipt]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM memories WHERE id = ?", (receipt_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_model(row)
        return None

    def add_memory(self, req: MemoryCreateRequest, receipt_id: Optional[str] = None) -> MemoryReceipt:
        if not self.verify_integrity()["valid"]:
            raise ValueError("Receipt chain integrity check failed; refusing to modify the vault.")
        now_iso = datetime.now(timezone.utc).isoformat()
        rid = receipt_id or f"REC-{uuid.uuid4().hex[:6].upper()}"
        initial_audit = [
            AuditEntry(
                timestamp=now_iso,
                action="created",
                new_content=req.content,
                reason="Initial ingestion with provenance receipt",
                performed_by="system"
            ).model_dump()
        ]

        source_hash = hashlib.sha256(req.source_excerpt.strip().encode("utf-8")).hexdigest()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO memories (
                    id, content, category, source_type, source_title, source_excerpt,
                    source_url, initial_confidence, created_at, last_confirmed_at,
                    valid_until, decay_curve, source_hash, audit_history
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                rid,
                req.content.strip(),
                req.category,
                req.source_type,
                req.source_title.strip(),
                req.source_excerpt.strip(),
                req.source_url.strip() if req.source_url else None,
                req.initial_confidence,
                now_iso,
                now_iso,
                req.valid_until,
                req.decay_curve,
                source_hash,
                json.dumps(initial_audit)
            ))
            conn.commit()

        self.rebuild_hash_chain()

        return self.get_memory(rid)

    def correct_memory(self, receipt_id: str, new_content: str, reason: str = "User sovereign correction", reset_confidence: float = 0.98) -> Optional[MemoryReceipt]:
        """Sovereign correction: updates content, resets confidence and last_confirmed_at, and writes to audit log."""
        if not self.verify_integrity()["valid"]:
            raise ValueError("Receipt chain integrity check failed; refusing to modify the vault.")
        mem = self.get_memory(receipt_id)
        if not mem:
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        new_audit = mem.audit_history.copy()
        new_audit.append(
            AuditEntry(
                timestamp=now_iso,
                action="corrected",
                old_content=mem.content,
                new_content=new_content.strip(),
                reason=reason,
                performed_by="user"
            )
        )
        audit_json = json.dumps([a.model_dump() for a in new_audit])

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE memories
                SET content = ?,
                    last_confirmed_at = ?,
                    initial_confidence = ?,
                    audit_history = ?
                WHERE id = ?
            """, (
                new_content.strip(),
                now_iso,
                reset_confidence,
                audit_json,
                receipt_id
            ))
            conn.commit()

        self.rebuild_hash_chain()

        return self.get_memory(receipt_id)

    def confirm_freshness(self, receipt_id: str) -> Optional[MemoryReceipt]:
        """User confirms memory is still accurate, resetting the decay clock."""
        if not self.verify_integrity()["valid"]:
            raise ValueError("Receipt chain integrity check failed; refusing to modify the vault.")
        mem = self.get_memory(receipt_id)
        if not mem:
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        new_audit = mem.audit_history.copy()
        new_audit.append(
            AuditEntry(
                timestamp=now_iso,
                action="refreshed",
                new_content=mem.content,
                reason="User reaffirmed fact freshness",
                performed_by="user"
            )
        )
        audit_json = json.dumps([a.model_dump() for a in new_audit])

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE memories
                SET last_confirmed_at = ?,
                    audit_history = ?
                WHERE id = ?
            """, (now_iso, audit_json, receipt_id))
            conn.commit()

        self.rebuild_hash_chain()

        return self.get_memory(receipt_id)

    def delete_memory(self, receipt_id: str) -> bool:
        """Sovereign forgetting: permanently erases the memory row from the local database.

        Two-step erasure:
        1. ``PRAGMA secure_delete = ON`` (set in _get_connection) causes SQLite to
           zero-fill the freed page(s) before releasing them — deleted content is not
           recoverable from database slack space.
        2. ``VACUUM`` compacts the file afterwards so the zeroed pages are not present
           in the on-disk file at all.
        """
        if not self.verify_integrity()["valid"]:
            raise ValueError("Receipt chain integrity check failed; refusing to modify the vault.")

        # Write tombstone BEFORE deleting so the record of deletion survives
        # even if the DELETE itself somehow fails mid-transaction.
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Insert tombstone (ignore if already exists — idempotent)
            cursor.execute(
                "INSERT OR IGNORE INTO tombstones (receipt_id, deleted_at) VALUES (?, ?)",
                (receipt_id, now_iso)
            )
            cursor.execute("DELETE FROM memories WHERE id = ?", (receipt_id,))
            conn.commit()
            deleted = cursor.rowcount > 0

        if deleted:
            # VACUUM must run outside the with-block (auto-commit mode required).
            raw_conn = sqlite3.connect(str(self.db_path))
            try:
                raw_conn.execute("PRAGMA secure_delete = ON")
                raw_conn.execute("VACUUM")
            finally:
                raw_conn.close()
            self.rebuild_hash_chain()

        return deleted

    def get_tombstones(self) -> list:
        """Returns all tombstone records (receipt_id + deleted_at only).

        This lets external callers confirm that a given receipt ID was
        deliberately forgotten, without exposing what the memory contained.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT receipt_id, deleted_at FROM tombstones ORDER BY deleted_at DESC")
            return [{"receipt_id": row["receipt_id"], "deleted_at": row["deleted_at"]} for row in cursor.fetchall()]

    def update_tavily_verification(self, receipt_id: str, status: str, details: str) -> Optional[MemoryReceipt]:
        if not self.verify_integrity()["valid"]:
            raise ValueError("Receipt chain integrity check failed; refusing to modify the vault.")
        now_iso = datetime.now(timezone.utc).isoformat()
        mem = self.get_memory(receipt_id)
        if not mem:
            return None

        new_audit = mem.audit_history.copy()
        new_audit.append(
            AuditEntry(
                timestamp=now_iso,
                action="verified",
                reason=f"Tavily source verification: {status}",
                performed_by="tavily"
            )
        )
        audit_json = json.dumps([a.model_dump() for a in new_audit])

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE memories
                SET tavily_verified_at = ?,
                    tavily_verify_status = ?,
                    tavily_verify_details = ?,
                    audit_history = ?
                WHERE id = ?
            """, (now_iso, status, details, audit_json, receipt_id))
            conn.commit()

        self.rebuild_hash_chain()

        return self.get_memory(receipt_id)

    def get_stats(self) -> VaultStats:
        all_memories = self.list_memories()
        total = len(all_memories)
        if total == 0:
            return VaultStats(
                total_memories=0,
                fresh_count=0,
                decaying_count=0,
                stale_count=0,
                average_confidence=0.0,
                verified_sources_count=0,
                db_path=str(self.db_path),
                storage_size_kb=0.0
            )

        fresh = sum(1 for m in all_memories if m.status == "fresh")
        decaying = sum(1 for m in all_memories if m.status == "decaying")
        stale = sum(1 for m in all_memories if m.status == "stale")
        avg_conf = sum(m.current_confidence for m in all_memories) / total
        verified = sum(1 for m in all_memories if m.tavily_verify_status == "verified_active")

        size_kb = (self.db_path.stat().st_size / 1024.0) if self.db_path.exists() else 0.0

        return VaultStats(
            total_memories=total,
            fresh_count=fresh,
            decaying_count=decaying,
            stale_count=stale,
            average_confidence=round(avg_conf, 2),
            verified_sources_count=verified,
            db_path=str(self.db_path),
            storage_size_kb=round(size_kb, 2)
        )

vault = LocalVault()
