# Receipts v4 — Midnight / Cobalt / Lime

## Brief and concept
A local-first assistant memory product for people who want to inspect, correct, or delete what the app remembers. The v4 system makes the receipt itself the proof object: black surfaces keep provenance quiet until a cursor passes, while cobalt structures the page and lime marks the active state. Off-white cards preserve the physical receipt identity.

Tone: dry, exact, lightly wry. Product and privacy claims remain tied to the current app code. UI does not imply provider availability before a successful request.

## Rejected directions
1. Generic dark neon dashboard with green glows — recognizable as a template, not a memory ledger.
2. Glassmorphism — blur weakens the source and audit hierarchy.
3. Beige thermal-paper palette — v3 leaned too literally into stationery and did not feel like the requested hackathon product.

## Tokens
All interface colors are declared in `static/css/tokens.css`; other styles use semantic variables.

| Token | Value | Use |
|---|---|---|
| black / black-2 / black-3 | #030407 / #0A0C12 / #12151D | base / surface / raised |
| cobalt / cobalt-deep / cobalt-soft | #1558C9 / #0B2F6E / #8FB3F5 | structure / pressed / accessible small text |
| lime | #D4FF24 | primary action and active stamp |
| text / text-2 / text-3 | #F4F6FA / #B6BCC8 / #8A92A2 | hierarchy |
| paper / ink | #ECEEE6 / #0A0B0F | receipt stock and its type |
| danger | #FF5A4D | errors and destructive actions only |
| line / line-strong | rgba(255,255,255,.14) / rgba(255,255,255,.28) | dividers and borders |

Cobalt is not small text on black. Black type sits on lime. Receipt paper uses ink. Lime is limited to action and status marks. No purple, blur or colored glows.

## Type scale
- Display: Bricolage Grotesque variable (200–800, width axis) with system fallback. H1 clamp(52px, 8.6vw, 138px), .92 line-height, tight tracking.
- UI/body: Instrument Sans 400–600. Body 17/28; small 14/22; minimum 12px.
- Mono: IBM Plex Mono for IDs, hashes, quotes and telemetry. Tabular numbers.
- Font files are self-hosted WOFF2 with OFL notices and `font-display: swap`.

## Shape, spacing and reveal
Square corners except 2px inputs/buttons. Hairlines define ledger structure. The landing uses a crisp 90px cursor mask to show a dot grid; it is disabled for touch and reduced-motion users. Receipt rows reveal real source/hash metadata on hover or focus. No scroll-jacking or blurred light effects.

## Components
Letterhead and console nav; lime primary button; outlined secondary/destructive controls; stamped receipt states; cobalt receipt object; live printer; receipt card and ledger row; citation details; modal slip; status chip; graph canvas; audit list; empty/loading/error messages.

## Page map
- `#/`: left-aligned hero, real saved receipt sample, live printer, itemized capabilities, data-flow ledger, notes, CTA and hash barcode footer.
- `#/styleguide`: tokens, type, stamp, button, record-backed receipt specimen and ledger row.
- `#/app/chat`: current chat service rendered as printed answer tape.
- `#/app/vault`: confidence summary and expandable receipt ledger.
- `#/app/graph`: relationship graph using current graph data.
- `#/app/copilot`: current staleness/conflict audit actions.
- `#/app/tour`: inspection walkthrough.
- Modals: existing Sync, Settings, Diagnostics, Conflict, Correction, Add Memory, Tavily and Outbound Ledger flows.

P0 is the active delivery scope: tokens/type, hero and printer, reveal, styleguide, console shell, Vault, Chat, itemized section/footer, modal isolation and slop check. P1 items do not start until the P0 review passes.
