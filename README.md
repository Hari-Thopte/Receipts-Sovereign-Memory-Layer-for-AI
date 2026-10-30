# Receipts — Sovereign Memory Layer

Receipts is a local FastAPI and SQLite prototype for reviewing remembered facts with source excerpts, confidence decay, and user controls. It includes a browser UI, optional Nebius Token Factory inference, optional Tavily search and verification, and encrypted vault export/import.

**Prototype status:** model IDs and live provider access depend on valid credentials and account access. The included demo records are illustrative. The app does not establish that a fact is true merely because it has a receipt. Hash-chain verification detects changes to the current stored receipt records; it is not a signed or externally anchored audit log.

## Run locally

1. Use Python 3.11 or newer.
2. Install dependencies: `python -m pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and configure provider keys only if you want those integrations.
4. Run `python run.py` and open `http://127.0.0.1:8000`.

The app stores its SQLite database under `data/`. Keep `.env` and `data/` private; neither belongs in source control. The MIT license is in `LICENSE`.

## Architecture & Data Flow

> A full deep dive and sequence lifecycle diagram are available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- Receipt records, audit history, and the outbound request ledger are stored in the local SQLite database. The ledger records the exact model request payload, endpoint, model, outcome, and latency; it does not store authorization headers.
- A chat request sends the user query and selected receipt context to Nebius Token Factory when live inference is configured. Do not submit sensitive content unless you accept that transfer.
- Tavily search and source verification send search terms or source URLs to Tavily when configured. Verification may also retrieve public source content.
- Encrypted sync bundles use a passphrase-derived key and AES-GCM. Anyone with the passphrase and bundle can decrypt it. The prototype does not provide account-based sync or key recovery.
- Local malware, a person with access to the machine, compromised provider credentials, and compromised external services are outside the protection provided by this prototype. Local deletion cannot guarantee removal from backups or storage snapshots.
- The receipt hash chain detects record edits when verified, but a person able to rewrite the database can recompute an unanchored chain. It is not a digital signature or proof against a privileged database editor.

## Integrations

- **NVIDIA Nemotron & Nebius Token Factory:** Model calls query open NVIDIA Nemotron models via OpenAI-compatible endpoints with bounded retries, streaming support, and fallback capabilities. Live inference executes with exact bracketed receipt citations.
- **Tavily Web Intelligence:** Real-time web search ingestion and automated source-drift verification via term overlap and extract comparison.

## Verification

Run `python -m pytest -q` for offline compliance, retry/fallback, encrypted bundle, and receipt-integrity checks. `GET /health` checks local vault availability.

## What changed during the submission period

The local demo was reviewed and upgraded to support live NVIDIA Nemotron inference, Tavily search ingestion and verification, masked credentials in the UI, outbound request ledger recording, parameterized half-life decay curves, interactive physics graph layout freezing, and AES-256-GCM authenticated cross-device sync.

## Project layout

- `app/`: FastAPI routes, SQLite vault, model client, Tavily client, and sync encryption.
- `static/`: browser interface, styles, and scripts.
- `tests/`: offline regression checks.
- `data/`: local runtime database; not a distributable source file.
- `Dockerfile`, `docker-compose.yml`: container configuration.
