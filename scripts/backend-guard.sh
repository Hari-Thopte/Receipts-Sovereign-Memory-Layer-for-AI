#!/usr/bin/env bash
set -euo pipefail

START_COMMIT="${1:-e7b3efe87911118a18ae1d29c824b825dbc9369d}"
PROJECT_PATH="previews/receipts-sovereign-memory/extracted/receipts-sovereign-memory"
git cat-file -e "${START_COMMIT}^{commit}" 2>/dev/null || { echo "BACKEND GUARD: unknown start commit: ${START_COMMIT}" >&2; exit 2; }

mapfile -d '' changed < <({
  git diff --name-only -z "$START_COMMIT" HEAD -- "$PROJECT_PATH"
  git diff --name-only -z "$START_COMMIT" -- "$PROJECT_PATH"
  git ls-files --others --exclude-standard -z -- "$PROJECT_PATH"
} | sort -zu)

allowed() {
  case "$1" in
    static/index.html|static/css/*.css|static/js/*.js|static/fonts/*|static/brand/*.svg|DESIGN.md|PROGRESS.md|AUDIT.md|screenshots/*|screenshots/**/*|scripts/*|scripts/**/*) return 0 ;;
    *) return 1 ;;
  esac
}

failed=0
for path in "${changed[@]}"; do
  [[ -z "$path" ]] && continue
  relative="${path#${PROJECT_PATH}/}"
  if ! allowed "$relative"; then
    printf 'BACKEND GUARD FAIL: non-frontend path changed: %s\n' "$path" >&2
    failed=1
  fi
done
if (( failed )); then exit 1; fi
printf 'BACKEND GUARD PASS: %d changed path(s), all frontend-allowlisted (start %s)\n' "${#changed[@]}" "$START_COMMIT"
