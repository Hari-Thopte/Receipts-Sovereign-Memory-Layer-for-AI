# Receipts redesign v4 progress

## Backend rollback compatibility
- Restored backend and server files to baseline `281e96a70d09c27494f663c65d4c01aa93edfb7e`.
- The baseline has no `/api/ingest/text`, `/api/query/compare`, or `/api/query/stream` routes. The file intake control is disabled with a clear unavailable note; comparison is a nonfunctional placeholder; Chat and the landing printer use the baseline non-streaming `/api/query` route.
- Baseline `/api/integrity`, `/api/outbound-ledger`, `/api/engine-status`, `/health`, and the existing CRUD, graph, sync, settings, and diagnostics routes remain available. Optional outbound telemetry fields show placeholders when the baseline response does not include them.
- **Needs backend (not done):** document file intake, no-memory response comparison, and streaming chat require backend endpoints not present at the baseline. No backend work was added for them.
- **Database restore pending:** the original SQLite file is not tracked by Git and is absent from the supplied ZIP. All six current SQLite/test database files were backed up outside the repository. Windows refused to remove the active vault and one test database because they are open in another process; no database content was overwritten. The source seed module is unchanged from baseline, but the active DB could not be rebuilt while those handles remain open.
- **Runtime verification pending:** the restored baseline app completed startup, but its `python run.py` bind failed with WinError 10048 because `127.0.0.1:8000` is already occupied. This host cannot identify or stop that listener. Endpoint response checks and the requested tab/modal click-through could not be run against the restored process.

## Current phase
P0 is complete and committed on branch `redesign-v4`. P1 implementation is committed as `a33d734`, with the static asset cache fix in `71f2d01`; P1 runtime screenshot verification is blocked by this host's browser/network policy.

## Done
- Confirmed `app/main.py` serves `static/index.html`, `static/css/tokens.css`, `static/css/thermal.css`, and `static/js/app.js` from this Receipts app directory. No frontend build step is needed.
- Captured the pre-v4 Chat, Vault, Graph, Copilot and Tour tabs plus all eight existing modals at 1440×900 in `screenshots/before-v4/`.
- Changed the title to `RECEIPTS v4`; a cache-busted hard refresh on :8000 showed the new title and CSS links. Proof: `screenshots/before-v4/step0-title-proof.png`.
- Replaced `DESIGN.md` with the v4 brief, concept, tokens, type scale, components, page map and three rejected directions.
- Added self-hosted Bricolage Grotesque variable WOFF2 and OFL notice; Instrument Sans and IBM Plex Mono remain self-hosted. Browser font check passed.
- Replaced the old paper palette with Midnight / Cobalt / Lime tokens, a cobalt receipt object, the saved-record hero receipt, pointer reveal, receipt provenance reveal, status marks and the v4 styleguide.
- Completed the P0 console shell, Vault ledger, Chat printed empty state, itemized landing ledger, footer barcode and modal styling/focus isolation. Existing API paths, backend logic, model calls and stored data were not edited.
- Added `scripts/slop-check.sh` and the Node checker, plus `scripts/contrast-audit.js` and `scripts/palette-audit.py`.
- Captured 50 after-v4 PNGs: seven routes at 1440/1024/390, all eight existing modals at those widths, the 1920×1080 at 125% view, three grayscale views and the logo-swap view.
- Playwright reported no browser console errors or horizontal overflow on route captures. Modal checks found one open modal at a time, all dialogs fit each viewport, and Escape closed them. Keyboard navigation reached all five tabs; the Settings dialog retained focus and closed with Escape.
- Contrast audit tested 21 used token foreground/background pairs. All passed WCAG AA at 4.5:1 or higher. Node slop checker passed.

## P1 implementation
- Added a read-only 0–30 day confidence scrub based on an actual saved receipt and its configured decay half-life. The preview does not alter stored timestamps or confidence.
- Added a keyboard/touch range divider comparing two current receipts, explicitly labeled illustrative and not an audit history.
- Turned the data disclosure into a cobalt band with the existing real outbound-ledger preview/action.
- Added a build spec sheet populated from the engine-status endpoint, with model IDs, configured endpoint, storage/sync details, bundled font licences and the Open Graph card path.
- Expanded the notes to six FAQs, styled the CTA as a lime tear-off coupon, and added the tour checklist.
- Added Ctrl/Cmd+K destination palette, `?` shortcut overlay, and `#/status`, `#/changelog`, and `#/privacy-and-licence` pages. The status page reports local health and distinguishes configured credentials from verified provider reachability. Changelog is a snapshot of actual local Git history.
- Added an 80 mm receipt print stylesheet. Existing graph edges, Copilot health gauge/KPIs and alert de-duplication remain driven by current API data.
- No backend files, API routes, model calls, or stored memory data were changed.
- Verification: JavaScript syntax check, slop checker and the 21-pair WCAG AA token audit passed. Playwright attempts to `127.0.0.1:8000` returned `ERR_NETWORK_ACCESS_DENIED`; the CUA browser inventory reports local browser use disabled in Work settings, so P1 screenshots and click-through could not be captured here.

## Palette audit
Measured key 1440×900 viewport screenshots (black / cobalt / lime / neutral):

- Landing: 67.7% / 18.2% / 4.0% / 10.2%.
- Chat: 74.1% / 20.5% / 1.0% / 4.4%.
- Vault: 74.9% / 20.1% / 0.7% / 4.3%.
- Graph: 78.0% / 19.8% / 0.5% / 1.8%.
- Copilot: 75.5% / 20.6% / 1.2% / 2.7%.
- Tour: 74.9% / 20.6% / 0.7% / 3.8%.

Lime remains below the requested approximate 10% ceiling. The console is darker than the suggested 60/30/10 split; the cobalt header band accounts for about 20% cobalt in those captures.

## Skipped / verification limits
- Axe/Lighthouse was not available in the current Node runtime. The token contrast audit and keyboard/modal walkthrough were run; a full axe/Lighthouse report remains outstanding.
- FPS sampling on a mid-range laptop was not available.
- The `.sh` runner could not be launched through Git Bash because MSYS failed to create its BaseNamedObjects handle in this host. The underlying Node checker was run directly and passed.

## Assumptions
- The landing hero and styleguide specimen use the first actual saved vault record. With no saved record, the UI states that none is available.
- Provider availability remains what the current engine-status endpoint reports. This pass made no provider calls and did not change credentials.
- The demo, GitHub, Devpost and Feedback destinations remain marked pending.

## Next
Complete P1 visual click-through and screenshot review when browser access is available. Do not begin P2 motion or sound flourishes before that review.

## Receipts frontend completion mission — Phase 0 audit
- Start commit: `e7b3efe87911118a18ae1d29c824b825dbc9369d`; branch `fix-and-landing`.
- `app/main.py` confirms `static/index.html` is returned at `/` and the `static/` folder is mounted at `/static`. No frontend build step is configured.
- Added `scripts/backend-guard.sh`, scoped to this app subtree so unrelated dirty sibling projects do not block work. It allowlists only requested frontend files and directories.
- Added `AUDIT.md` with source-level control audit and honest runtime verification limits. Added `screenshots/audit-before/README.md`; no image is claimed as a new capture.
- Chromium launch attempts via Playwright, including elevated execution, failed with `spawn UNKNOWN`. The CUA inventory reports browser access disabled. The server listener is inaccessible to HTTP probes in this host. No temporary title edit was made because a hard-refresh screenshot could not be checked.
- Removed the prior uncommitted lime-only override and restored the root HTML to the committed version. The current task specifies the existing black/cobalt/lime identity and keeping lime below ~10%.

### Needs backend (not done)
- No backend work has been requested or performed. Comparison, streaming, and text ingest remain unavailable in the restored baseline; the UI must present clear disabled states.

## Frontend completion mission — current pass
- Branch: `fix-and-landing`; start commit: `e7b3efe87911118a18ae1d29c824b825dbc9369d`.
- Updated the compact console headers, removed the always-on staleness banner, populated the stale chip popover, disabled Compare with a visible reason, and revised engine status to distinguish missing key from configured-but-unverified service.
- Rebuilt the graph renderer to use the actual `/api/graph` schema, category fills, confidence sizes, stale hatching, data-backed/inferred edges, responsive layout, selection details, zoom, reset and pointer pan. Added Tour run results and a six-step Run all control; Settings now has grouped fields, key visibility controls, busy/status feedback and scroll/focus handling.
- Made tab navigation use route history. Landing printer request failures now try to print a clearly labelled saved-record sample. Removed raw exception text from user-facing frontend errors and removed console error logging.
- Source review verified `/api/engine-status` does not include `has_tavily_key`; Tour step 5 now says that status is unavailable and points to Settings/Verify, rather than incorrectly saying the key is missing.
- The requested browser checks remain blocked: Playwright Chromium launch returns `spawn UNKNOWN`; CUA reports browser access disabled; shell HTTP access to `127.0.0.1:8000` is denied. Therefore no fresh before/after screenshots, runtime clicks, network capture, axe scan, or palette sampling is claimed. Existing `screenshots/after/` and `screenshots/after-v4/` captures are historical only; see `screenshots/audit-after/README.md`.
- Verification: `node --check static/js/app.js` passed; `scripts/backend-guard.sh e7b3efe87911118a18ae1d29c824b825dbc9369d` passed immediately before commit. Manual WCAG contrast calculations passed for 10 key token pairs (text, secondary/muted text, cobalt-soft, lime, status colors, ink on paper and cobalt on paper); this is not a full rendered-DOM audit. `scripts/slop-check.sh` source checks passed but its palette stage is blocked because there is no fresh capture manifest. Axe, reduced-motion browser, keyboard-only, console/network and multi-viewport checks remain unverified.
- Do not treat UI source review as runtime verification.

### Needs backend (not done)
- The baseline engine-status route has no read-only Tavily credential-presence field. A future frontend can show exact Needs API key vs configured state only after a backend status field is added. This pass leaves that Tour check explicitly unavailable and does not query or reveal the key.
- Compare, streaming chat, and text intake still lack baseline routes; Compare stays disabled with a reason.

## Preview route and graph labels follow-up
- Registered the `fix-and-landing` preview slug in the client router. A plain fragment such as `#itemized` now selects the landing page and scrolls to that section; unknown (including empty) `preview` parameters continue to the existing Paper Jam route. Existing `#/app/*` deep links still use the app router.
- Graph labels are permanent, centered, monospace SVG text under each node. Grid spacing uses wider slots, long text truncates with an ellipsis, pending/stale nodes remain hatched and dimmed circles no longer dim their text below 68% opacity. Keyboard focus and selection behavior remain enabled.
- Bumped the thermal CSS and app JS query versions to force clients to fetch these updates.
- Verification: app root and both versioned assets returned HTTP 200; the served root contains the new asset version; `/api/graph` returned 6 nodes and 0 server edges. The frontend infers links client-side from shared categories/tokens when the server edge list is empty. `node --check static/js/app.js` passed. Playwright Chromium remains unavailable (`spawn UNKNOWN`), so browser scroll position, actual rendered labels and console state are not claimed as verified.
- Dev command: from `previews/receipts-sovereign-memory/extracted/receipts-sovereign-memory`, run `python run.py` (serves `http://127.0.0.1:8000`).

## Landing audit gates — 2026-10-30
- Request source: user attachment `CONTEXT Project: Receipts...`; the brief supersedes the prior broad pass and limits edits to the Receipts frontend (no new libraries).
- Assumptions: existing plain-root route is the canonical landing; social/demo URLs are unknown, so their links stay hidden until configured. A printed fallback must always be marked `SAMPLE · offline`. Live status is session-local and only turns on after an actual response names Nebius Token Factory without a simulated/fallback marker.
- The requested Playwright audit is in `tests/e2e/landing-audit/landing-audit.mjs`. The pre-gate failures are preserved in `AUDIT_BEFORE.txt`. It uses the Codex-bundled Playwright and installed Chrome; no dependency was added.
- Gate 1: PASS. Plain `/` title and landing, CTA text/contrast/width, duplicate copy, profile menu, logo-to-home from Vault, engine wording, and visible placeholder scan pass at 1280×720, 1440×900, 1920×1080 and 390×844. Screenshots: `screenshots/gate-1/`.
- Gate 1 output: `AUDIT_GATE_1_FINAL.txt`.
- Gates 2–5 were completed and their final checks are recorded below.

- Gate 2: PASS. Rebuilt the hero as a 12-column copy/printer + blue receipt panel; the left-side question input fits at 1280 and the printed paper now sits inside the panel at first viewport. Offline sample copy is explicitly labelled and uses a saved record plus available source hash; the live state is gated on the existing successful Nebius provider check. Watch demo remains hidden because there is no configured demo URL. Playwright output: AUDIT_GATE_2B_FINAL.txt; screenshots at screenshots/gate-2/ for 1280×720, 1440×900, 1920×1080 and 390×844. C3, C4 and C14 pass at the specified desktop sizes; C4/C14 are intentionally tested at 1280. No backend files or calls were changed.

- Gate 3: PASS. Replaced the old slider and unrelated comparison with a pinned 30-day story based on the existing REC-PST4 Seattle seed receipt and the task-specified Austin conflict. The story follows c(day)=95×0.5^(day/14), fades ink to the required 55% minimum, strikes the old location at day 14, marks it STALE by day 26, and thumps a REAFFIRMED stamp onto Austin at day 30. The new REC-AUS7 seed row is inserted idempotently into populated vaults without replacing existing records. Test test_seed_adds_conflicting_location_without_replacing_existing_memory passed. Since the already-running server process still serves the pre-update database, the frontend explicitly labels the Austin fallback EXAMPLE SEED; the seed change takes effect on server restart or demo reseed. Reduced-motion view uses a static, unpinned layout and shows all five story captions. Playwright output: AUDIT_GATE_3B_FINAL.txt; screenshots: screenshots/gate-3/ including the 10%, 50%, 90% and day-30 scroll captures.

- Gate 4: PASS. Added six visible itemized capability rows with console links, a sticky receipt tape that reaches TOTAL 6 ITEMS, a scroll spy and 3px progress line, 56px compact header state after 80px, a real saved-receipt ticker, outbound request rendering with a clearly labelled empty/error example state, readable white/lime text on the blue data band and black request card, copyable configured model IDs, staggered spec rows, a reduced-motion-safe tear-off reveal, and a hidden lazy YouTube embed that appears only for a configured embed URL. The itemized nav anchors now remain on the landing and scroll to the selected section. A contrast scan found and fixed the blue band marker and black text on the dark outbound card; the final scanner passes at all four viewports. Full audit output: AUDIT_GATE_4C_FINAL.txt — 68/68 pass, zero browser errors, no horizontal overflow, contrast checks pass. Screenshots at screenshots/gate-4/ for 1280×720, 1440×900, 1920×1080 and 390×844, plus pinned-story scroll captures. Social links, demo URL and video remain hidden because no verified destinations are configured.

- Gate 5: PASS. Vault Actions now opens/closes accessibly (Escape/outside click), Reset Demo lives in Settings under a danger-zone confirmation, and the mobile console tabs remain tappable at 390px. Copilot recommendations are deduplicated and report Local rules or Nemotron from the response source; the empty state no longer claims Nemotron generated local output. app/seed_data.py is the only backend source file changed: it adds REC-AUS7 as a newer Austin location conflict and inserts it idempotently into a populated demo vault; tests/test_compliance.py verifies both the existing-record preservation and newer timestamp. Targeted regression: SEED_REGRESSION_PASS.txt (1 passed). Console click-through: CONSOLE_GATE_5_FINAL.txt (56/56 pass for Chat, Vault, Graph, Copilot, Tour, all eight modals, reset confirmation, source/dedupe checks, no horizontal overflow, no console/page errors or failed HTTP responses at 1440×900 and 390×844). Final landing audit: AUDIT_GATE_5_FINAL.txt (68/68 pass at 1280×720, 1440×900, 1920×1080 and 390×844; zero browser errors). Screenshots: screenshots/gate-5/ (landing, four day-story scroll states, all five tabs, and all eight modals at 1440×900 and 390×844).
- Verification note: the targeted seed test passes. The broader python -m pytest tests/test_compliance.py -q run reported 3 passed and 3 pytest fixture-cleanup errors because Windows returned WinError 32 while pytest tried to remove open SQLite files under the temp directory. This did not fail the seed assertions; the requested seed regression was rerun independently and passed. No backend API route or model call was changed.
- Run from this app directory with python run.py; the frontend has no build step. The current server process has not been restarted, so it continues to serve the old persisted DB; the Austin record appears as an explicitly marked EXAMPLE SEED in this process and is inserted by the updated seed code at restart or Reset Demo.

## Three-fix pass — 2026-10-30
- Scope: only console header alignment, Vault stamps/provenance, and the Graph screen; preserve the existing palette and tokens. No landing, Chat, Copilot, Tour, modal, API, or model behavior changes are intended.
- Assumptions: the existing `/api/graph` response is authoritative for relationships; the frontend must not infer extra edges when the API returns none. Future confidence preview uses the app's existing half-life curves and is labelled illustrative.
- Fix 1 complete: header status is a single OFFLINE/LIVE · Nebius line; the profile control is 40px high, with the avatar and chevron retained on mobile. Dropdown interactions still work. Playwright H checks passed at 1280x720, 1440x900, and 390x844; screenshots are in `screenshots/fixes/` and raw output is `screenshots/fixes/header-audit-output.txt`.
- Fix 2 complete: Vault rows use solid labelled stamps (fresh/lime, fading/amber, stale/red-orange); only the stale stamp’s left strip is hatched. Removed record-ID strikethrough and the generic hover phrase; stale facts use a dotted underline. Expanded receipts now show SOURCE, EXCERPT, SHA-256 (copy button), CREATED, LAST CONFIRMED and HALF-LIFE with explicit missing-data text. The receipt barcode is constrained to its existing 22px slot.
- Vault Playwright checks passed: 30/30 across 1280x720, 1440x900 and 390x844. Stale stamp text contrast measured 6.39:1; all six labels are present and populated for each of the six current rows; no horizontal overflow, console/page errors or failed HTTP responses. Screenshots and raw output are in `screenshots/fixes/` (`before-vault-*`, `after-vault-*`, `after-vault-provenance-expanded-1440x900.png`, `vault-audit-output.txt`).
- Fix 3 complete: replaced the graph row with a dark dotted canvas, category clusters with confidence-sized nodes and rings, a compact toolbar/search, Graph/List mode, responsive legend, and an overlay receipt inspector with source, hash, barcode and existing Reaffirm/Edit/Forget actions. Pointer drag pins nodes; wheel zoom is cursor-centered; keyboard arrows, Enter and Escape work. The illustrative day scrub updates confidence rings from the record’s existing half-life category. Mobile labels truncate inside canvas bounds.
- Graph edges now render only from `/api/graph`; the current API returns zero edges, so the current graph correctly shows no relationship lines and no edge-style legend claims. Stale nodes retain the hatch and the legend reports Stale · hatched. No backend/API files were changed.
- Graph Playwright audit passed: 42/42 checks across 1280x720, 1440x900 and 390x844, including API node/edge parity, node spacing/radius, label bounds/non-overlap, selection drawer, focus/arrow/Enter/Escape, drag pin, zoom, decay scrub, Graph/List, no horizontal overflow, and zero console/page/network errors. Raw output: `screenshots/fixes/graph-audit-output.txt`; screenshots: `before-graph-*`, `after-graph-*`, `after-graph-drawer-1440x900.png`, and `after-graph-list-1440x900.png`.
- Header and Vault regression audits were rerun after the graph changes and passed 38/38 and 30/30 respectively at all three viewport sizes.
- Scope summary: the landing, Chat, Copilot, Tour, and modal markup/visual rules are unchanged; shared JS changes are restricted to graph keyboard controls and closing the graph inspector on Escape. The app loads updated CSS/JS with cache version `receipts-fixes-3`.

## Focused landing and graph fixes — 2026-10-30
- Scope: Fix A (hero console button states, duplicate printer label, shared button contrast) and Fix B (relationship derivation, graph layout/labels/selection/drawer/toolbar/legend/barcodes). Preserve current brand and existing APIs; no new dependencies.
- Assumptions: graph relationships are computed from the currently loaded receipt data using the existing conflict checker for conflict edges, source/category equality for inferred edges, and the documented keyword Jaccard rule for similarity. Missing external URLs and unsupported backend relationships remain unclaimed.
- Fix A complete: corrected hero button default/hover/active/focus/disabled styles with WCAG contrast, provided ink-colored text for the Chat send button, and made the printer question label accessible but visually hidden. Audit passed 728/728 checks; landing/screenshots and output are in `screenshots/fix-graph-2/`.
- Fix B complete: graph edges follow conflict → supersedes → Jaccard similarity (≥0.15) → shared source/category inference, with one edge per pair. The same-subject location-field check reconciles the seeded Austin and Seattle facts when the existing API detector does not return that city change. No backend or dependency files changed.

- Seed edge results: 7 nodes, 4 rendered edges (one REC-AUS7 ↔ REC-PST4 conflict and three same-category inferred links). No saved pair met similarity threshold and no correction audit entry linked two separate records, so no similarity/supersedes edge was shown. The edge-less fallback was not visible because the seed had four links; its existing Scan Conflicts action is retained.
- Graph finish: short fact labels, stale tag, confidence-sized circles, collision, responsive compact category layout, fit on load/resize/Fit, selection rings and dimming, edge-specific legend/tooltip, toolbar icons, one-body receipt drawer, and 36–44px ink-on-cream barcode with a short hash. Category filters now hide matching nodes and connected edges, and keyboard traversal skips filtered nodes. Graph barcode, Vault barcode and landing barcode contrast measured 16.18:1.
- Final checks: graph Playwright 50/50 at 1280×720, 1440×900 and 390×844; console Playwright 56/56 at 1440×900 and 390×844 (all five tabs, eight modals, Reset Demo confirmation, no console/page/HTTP errors); Fix A button audit 728/728. Raw outputs and before/after images are in `screenshots/fix-graph-2/`.
- Pixel-diff note: the available landing baseline is a full-page 1440×6274 capture while the current landing image is 1440×900. Other historical screenshots predate Fix 3 and include different data/mock states, so whole-page pixel differences are not attributable to this pass. Known intentional deltas outside the graph: shared button contrast and Chat send-button correction from Fix A, and the receipt barcode/hash treatment required by Fix B7.
