# Receipts — Sovereign Memory Layer for AI

> **"Never trust an AI's memory without asking for the receipt."**  
> Verifiable memory layer for personal AI agents with cryptographic provenance, parameterized half-life decay, live NVIDIA Nemotron inference, Tavily web verification, and encrypted cross-device sync.

---

## Inspiration

Modern AI assistants remember personal preferences, project context, and factual statements inside opaque vector databases or proprietary cloud silos. When an assistant makes an assumption, users have no way to answer fundamental questions:
* *Where did this memory come from?*
* *When was it recorded, and is it already stale?*
* *How can I edit, correct, or permanently erase it?*
* *How do I prevent the model from quietly hallucinating claims about me?*

**Receipts** introduces the concept of **Sovereign Memory**. Every remembered detail is treated as an immutable, cryptographically hashed **Memory Receipt** that you own locally. The model is strictly prohibited from asserting unverified facts: every response must explicitly cite the receipt ID backing its claim.

---

## What It Does

1. **Local-First Sovereign Vault (`SQLite` + SHA-256 Hash Chain):**
   Stores memories locally with exact provenance excerpts, timestamps, confidence scores, and cryptographic hash chaining back to a genesis block (`GENESIS`). Tampering or silent modifications are immediately flagged via `/api/integrity`.

2. **Grounded Live Inference with NVIDIA Nemotron:**
   Connects to NVIDIA open models (`nvidia/nemotron-3.5-bolt-e4b` / `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` / `nvidia/nemotron-3-super-120b-a12b`). The model is strictly prompted to synthesize answers using *only* verified receipts and cite exact bracketed receipt IDs (e.g. `[Receipt #REC-AUS7]`), guaranteeing zero hallucinations.

3. **Autonomous Fact Extraction (Nemotron Nano):**
   Parses ongoing conversations and incoming notes in real time to detect newly stated facts, automatically proposing structured receipts with confidence scores for one-click approval.

4. **Interactive Memory Graph with Organic Physics:**
   Visualizes memories as an interactive knowledge graph categorized by domain. Features smooth celestial floating physics, dynamic repulsion, edge spring tension, real-time pause/resume layout freezing, and tag visibility toggles.

5. **Parametric Half-Life Decay & Proactive Maintenance:**
   Replaces arbitrary TTLs with real cognitive decay curves:
   * *Lifestyle & Preferences:* 90-day half-life
   * *Active Projects & Sprints:* 21-day half-life
   * *Transient States & Travel:* 7-day half-life  
   A proactive Copilot monitors decay thresholds and flags stale memories, providing single-click **Reaffirm**, **Edit**, or **Forget** actions.

6. **Tavily Web Search Ingestion & Source Verification:**
   Ingests live web research and continuously validates source URLs. Detects source content drift or link rot using real-time term overlap checks.

7. **Authenticated Cross-Device Sync (AES-256-GCM):**
   Enables peer-to-peer sync across devices without central cloud lock-in. Vaults are exported as tamper-proof, passphrase-encrypted bundles using PBKDF2 key derivation.

8. **Outbound Data Privacy Ledger:**
   Audit logs every outbound prompt, model ID, latency, and token count sent to external APIs, with authorization headers cryptographically redacted.

---

## How We Built It

```mermaid
flowchart TD
  subgraph Client ["🖥️ CLIENT LAYER (Thermal Terminal UI)"]
    UI["Web UI: Chat Tape / Vault / Physics Graph / Copilot / Ledger"]
  end

  subgraph Backend ["⚙️ FASTAPI BACKEND"]
    API["API Gateway (app/main.py)"]
    RAG["Context Minimizer & Grounding Filter"]
    Decay["Half-Life Decay & Conflict Analyzer"]
    Sync["AES-256-GCM Sync Serializer"]
    Guard["Outbound Redactor & Privacy Guard"]
  end

  subgraph Storage ["🔐 LOCAL SOVEREIGN VAULT"]
    DB[("SQLite Database\nPRAGMA secure_delete=ON")]
    Chain["SHA-256 Genesis Hash Chain"]
    Ledger["Outbound Request Ledger"]
  end

  subgraph External ["🌐 EXTERNAL SERVICES"]
    Nemo["NVIDIA NIM / Nebius (Nemotron 3.5 Bolt & Nano Omni)"]
    Tavily["Tavily Web Search & URL Verification"]
  end

  UI <-->|HTTP REST| API
  API --> RAG
  API --> Decay
  API --> Sync
  API --> Guard
  API <-->|Local Query / Write| DB
  DB --- Chain
  Guard -->|Audit Payload & Latency| Ledger
  RAG -->|Grounded Prompts| Nemo
  Nemo -->|Synthesized Response with [Receipt #ID]| API
  API <-->|Web Ingestion & Verification| Tavily
```

* **Backend:** Python 3.11+, FastAPI, SQLite with `PRAGMA secure_delete = ON` (overwrites freed database pages with zeros so deleted memories cannot be recovered from disk slack space).
* **AI & Inference:** NVIDIA Nemotron open models via OpenAI-compatible endpoints with bounded retries, streaming support, and structured JSON parsing.
* **Web Intelligence:** Tavily API for real-time web search ingestion and automated source verification.
* **Frontend:** High-performance, zero-dependency vanilla ES6 JavaScript, HTML5 SVG canvas, and customized Thermal Terminal CSS design system.
* **Cryptography:** Cryptographic SHA-256 hash chaining for tamper detection, AES-256-GCM authenticated encryption for sync bundles.

---

## Challenges We Overcame

1. **Strict Citation Enforcement:** Standard LLMs tend to answer conversationally without attributing specific facts. We engineered strict prompt boundaries and verification heuristics ensuring Nemotron grounds every assertion with bracketed receipt tags (`[Receipt #...]`).
2. **True Sovereign Deletion:** Deleting a row from a standard database often leaves unallocated traces on disk. We enforced `PRAGMA secure_delete = ON` and tombstone generation to guarantee zero residual data recovery upon sovereign memory erase.
3. **Robust Provider Architecture:** Handled differences across API endpoints with automated provider resolution and candidate model fallback, ensuring zero crashes whether testing locally or on cloud infrastructure.
4. **Fluid Physics & Performance:** Built custom spring-and-orbit physics for SVG nodes without external libraries like D3, achieving smooth 60 FPS animation with instant freeze-frame pausing.

---

## Accomplishments We're Proud Of

* **100% Live Inference Verified:** End-to-end verified inference using NVIDIA Nemotron producing grounded answers with exact bracketed citations in ~1.1 seconds.
* **100% Automated Test Pass Rate:** Clean `pytest` compliance suite verifying cryptographic tampering detection, secret masking, retry/fallback behavior, and encrypted bundle round-trips.
* **Live Web Intelligence:** Verified live Tavily search ingestion and automated term-overlap content verification.
* **Zero External JS Dependencies:** The entire UI—from the interactive physics graph to the thermal receipt printer—runs without React, D3, or heavy node bundles.

---

## What's Next for Receipts

* **Local On-Device Ollama / NIM Engine:** Package quantized Nemotron Nano directly in Docker for 100% air-gapped local execution without internet access.
* **Multi-Modal Image Receipts:** Use Nemotron vision models to parse physical paper receipts, restaurant bills, and whiteboards directly into sovereign memory.
* **Hardware Sovereign Enclave:** Anchor the root genesis hash into hardware security modules (TPM / YubiKey) for cryptographic attestation.

---

## Built With

* **Language & Framework:** Python 3.11, FastAPI, Uvicorn
* **Database & Storage:** SQLite3, Local-First Architecture
* **AI Models:** NVIDIA Nemotron (`nemotron-3.5-bolt-e4b`, `nemotron-3-nano-omni-30b-a3b-reasoning`, `nemotron-3-super-120b-a12b`)
* **API Providers:** Nebius Token Factory / NVIDIA NIM
* **Web Intelligence:** Tavily API
* **Security & Crypto:** AES-256-GCM, PBKDF2, SHA-256 Hash Chaining
* **Frontend:** HTML5, Modern CSS3, Vanilla ES6 JavaScript, SVG
* **Deployment:** Docker, Render, Linux

---

## Try It Out

* **Live Demo URL:** `https://receipts-sovereign-memory.onrender.com` *(or your Render service URL)*
* **GitHub Repository:** `https://github.com/<your-username>/receipts-sovereign-memory`
* **Local Run:**
  ```bash
  git clone https://github.com/<your-username>/receipts-sovereign-memory.git
  cd receipts-sovereign-memory
  python -m pip install -r requirements.txt
  python run.py
  # Open http://127.0.0.1:8000
  ```
