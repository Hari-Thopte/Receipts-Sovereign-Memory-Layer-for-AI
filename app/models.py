from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class AuditEntry(BaseModel):
    timestamp: str
    action: str  # created, corrected, verified, refreshed
    old_content: Optional[str] = None
    new_content: Optional[str] = None
    reason: Optional[str] = None
    performed_by: str = "user"

class MemoryReceipt(BaseModel):
    id: str = Field(..., description="Unique receipt identifier, e.g. REC-8492")
    content: str = Field(..., description="The remembered fact statement")
    category: str = Field(default="preference", description="lifestyle, project, factual_web, personal")
    source_type: str = Field(default="document", description="email, document, tavily_search, chat, slack")
    source_title: str = Field(..., description="Title or descriptor of provenance source")
    source_excerpt: str = Field(..., description="Literal excerpt proving source provenance")
    source_url: Optional[str] = Field(default=None, description="URL for web/Tavily sources")
    initial_confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    current_confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    created_at: str
    last_confirmed_at: str
    valid_until: Optional[str] = None
    decay_curve: str = Field(default="lifestyle_preference", description="lifestyle_preference, active_project, transient_state")
    status: str = Field(default="fresh", description="fresh, decaying, stale")
    staleness_risk: str = Field(default="low", description="low, medium, high")
    days_since_confirmed: int = 0
    tavily_verified_at: Optional[str] = None
    tavily_verify_status: Optional[str] = None
    tavily_verify_details: Optional[str] = None
    source_hash: Optional[str] = Field(default=None, description="SHA-256 digest of source_excerpt computed at ingest")
    previous_hash: Optional[str] = Field(default=None, description="Previous record hash in the local receipt chain")
    receipt_hash: Optional[str] = Field(default=None, description="SHA-256 digest of this receipt record and its predecessor")
    audit_history: List[AuditEntry] = Field(default_factory=list)

class MemoryCreateRequest(BaseModel):
    content: str
    category: str = "preference"
    source_type: str = "document"
    source_title: str
    source_excerpt: str
    source_url: Optional[str] = None
    initial_confidence: float = 0.90
    decay_curve: str = "lifestyle_preference"
    valid_until: Optional[str] = None

class MemoryCorrectionRequest(BaseModel):
    new_content: str
    reason: Optional[str] = "User sovereign correction"
    reset_confidence: Optional[float] = 0.98

class QueryRequest(BaseModel):
    query: str
    include_stale: bool = False
    max_receipts: int = 4

class NanoExtractedFact(BaseModel):
    """A candidate fact returned by Nemotron Nano extraction."""
    content: str
    category: str = "preference"
    decay_curve: str = "lifestyle_preference"
    source_excerpt: str
    confidence: float = 0.85

class NanoSaveRequest(BaseModel):
    """Request body for the user confirming they want to save extracted facts."""
    facts: List[NanoExtractedFact]
    source_title: str = "Chat conversation (Nemotron Nano extraction)"

class QueryResponse(BaseModel):
    answer: str
    used_receipts: List[MemoryReceipt]
    total_vault_memories: int
    context_filtered_count: int
    model_used: str
    is_simulated: bool = False
    degraded_message: Optional[str] = None
    latency_ms: Optional[int] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    reasoning_steps: List[str] = Field(default_factory=list)
    extracted_facts: List[NanoExtractedFact] = Field(default_factory=list)

class TavilySearchIngestRequest(BaseModel):
    query: str
    category: str = "factual_web"
    decay_curve: str = "transient_state"

class TavilyVerifyRequest(BaseModel):
    receipt_id: str

class TavilyVerifyResponse(BaseModel):
    receipt_id: str
    status: str  # verified_active, content_drift, unreachable, skipped
    details: str
    matched_snippet: Optional[str] = None
    before_excerpt: Optional[str] = None
    after_excerpt: Optional[str] = None
    verified_at: str

class SettingsUpdateRequest(BaseModel):
    nebius_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None
    nemotron_model: Optional[str] = None

class ResetDemoRequest(BaseModel):
    confirmed: bool = False

class VaultStats(BaseModel):
    total_memories: int
    fresh_count: int
    decaying_count: int
    stale_count: int
    average_confidence: float
    verified_sources_count: int
    db_path: str
    storage_size_kb: float

# ── New: Conflict Detection ───────────────────────────────────────────────────

class ConflictCheckRequest(BaseModel):
    proposed_fact: str
    exclude_receipt_id: Optional[str] = None

class ConflictResult(BaseModel):
    has_conflicts: bool
    conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    proposed_fact: str

# ── New: Staleness Alerts ─────────────────────────────────────────────────────

class StalenessAlert(BaseModel):
    receipt_id: str
    fact_snippet: str
    status: str
    days_since_confirmed: int
    staleness_risk: str
    current_confidence: float
    decay_curve: str
    message: str
    recommended_action: str

# ── New: Encrypted Sync ───────────────────────────────────────────────────────

class SyncExportRequest(BaseModel):
    passphrase: str = Field(..., min_length=4, description="Encryption passphrase for AES-256-GCM vault bundle")
    user_id: str = Field(default="default", description="User identity label for multi-user sync")
    include_audit_history: bool = True

class SyncImportRequest(BaseModel):
    passphrase: str
    encrypted_bundle: Dict[str, Any]
    merge_strategy: str = Field(default="skip_existing", description="skip_existing or overwrite")

class SyncImportResult(BaseModel):
    imported_count: int
    skipped_count: int
    error_count: int
    errors: List[str] = Field(default_factory=list)
    user_id: str

# ── New: Agentic Memory Tools ─────────────────────────────────────────────────

class AgentSuggestion(BaseModel):
    type: str  # refresh_alert, conflict_hint, graph_cluster, ask_user
    priority: str  # high, medium, low
    receipt_ids: List[str] = Field(default_factory=list)
    title: str
    description: str
    action: str

class AgentSuggestRequest(BaseModel):
    user_context: str = ""
    max_suggestions: int = 5

class AgentSuggestResponse(BaseModel):
    suggestions: List[AgentSuggestion]
    vault_health_score: float  # 0.0–1.0 based on freshness distribution
    model_used: str

# ── New: Memory Graph ─────────────────────────────────────────────────────────

class MemoryGraphNode(BaseModel):
    id: str
    label: str
    category: str
    status: str
    confidence: float
    size: float  # visual size hint based on confidence
    color: str   # color by category

class MemoryGraphEdge(BaseModel):
    source: str
    target: str
    weight: float
    relationship: str  # same_category, shared_keywords, conflict

class MemoryGraph(BaseModel):
    nodes: List[MemoryGraphNode]
    edges: List[MemoryGraphEdge]
    total_nodes: int
    total_edges: int
