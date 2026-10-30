#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKENS="$ROOT/static/css/tokens.css"
CSS="$ROOT/static/css/thermal.css"
HTML="$ROOT/static/index.html"
fail=0

check_absent() {
  local label="$1" pattern="$2"
  shift 2
  if rg -n -i "$pattern" "$@"; then
    printf 'SLOP CHECK FAIL: %s\n' "$label" >&2
    fail=1
  fi
}

check_absent 'template font family' '\b(Inter|Space[ -]Grotesk|Poppins|Roboto)\b' "$TOKENS" "$CSS"
check_absent 'hue-shifting gradients or backdrop filter' 'hue-gradient|backdrop-filter\s*:' "$CSS"
check_absent 'literal CSS color outside the token file' '#[0-9a-fA-F]{3,8}\b' "$CSS"
check_absent 'pill radius on controls' '\.(btn|thermal-button|engine-pill|staleness-chip)[^{]*\{[^}]*border-radius:\s*(?:[3-9][0-9]px|[1-9][0-9]{2,}px|999px)' "$CSS"

if rg -n 'class="[^"]*(grid|cards)[^"]*"' "$HTML" | rg -i 'landing|feature|itemized|thermal'; then
  echo 'SLOP CHECK REVIEW: landing grid class needs manual card-grid count.'
fi

if [[ ! -f "$ROOT/screenshots/after/capture-manifest.json" ]]; then
  echo 'SLOP CHECK BLOCKED: fresh screenshot capture manifest is missing; historical images are not sampled.' >&2
  fail=1
else
  python - "$ROOT/screenshots/after" <<'PY' || fail=1
from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:
    print("SLOP CHECK BLOCKED: Python Pillow is unavailable for screenshot palette sampling.", file=sys.stderr)
    raise SystemExit(1)

root = Path(sys.argv[1])
screenshots = list(root.glob("*.png"))
required = {"landing", "chat", "vault", "graph", "copilot", "tour"}
found = {name for name in required if any(name in path.name.lower() for path in screenshots)}
if not screenshots or found != required:
    print("SLOP CHECK BLOCKED: after screenshots must include landing, chat, vault, graph, copilot and tour.", file=sys.stderr)
    raise SystemExit(1)

for path in screenshots:
    image = Image.open(path).convert("RGB")
    pixels = list(image.resize((240, 150)).getdata())
    lime = sum(1 for r, g, b in pixels if g > 190 and r > 150 and b < 100) / len(pixels)
    print(f"{path.name}: sampled lime {lime:.1%}")
    if lime > 0.10:
        print(f"SLOP CHECK FAIL: lime exceeds 10% in {path.name}.", file=sys.stderr)
        raise SystemExit(1)
PY
fi

if (( fail )); then exit 1; fi
echo 'SLOP CHECK PASS'
