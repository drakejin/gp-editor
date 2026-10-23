#!/usr/bin/env bash
# E2E smoke test of the built app: hand it Guitar Pro (and Power Tab, TablEdit) files the way Finder does (`open -a`) and check that
# each one loads (the app logs its new window title, which is set only after a successful parse) and that
# the app is still running afterwards. Needs a Release build (npm run build:macos).
# Usage: scripts/e2e-open.sh [file ...]   — default: one fixture per format
#        GPEDITOR_APP=/path/GPEditor.app scripts/e2e-open.sh   — test another copy (e.g. an unpacked release zip)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${GPEDITOR_APP:-${APP_DIR}/macos/build/DerivedData/Build/Products/Release/GPEditor.app}"
FIXTURES="${APP_DIR}/../../packages/gp-core/test/fixtures"
TIMEOUT_TICKS=40   # × 0.5 s

if [[ ! -d "$APP" ]]; then
    echo "[e2e] error: ${APP} not found — run npm run build:macos first" >&2
    exit 1
fi

files=("$@")
if [[ ${#files[@]} -eq 0 ]]; then
    files=(
        "${FIXTURES}/guitarpro1/carulli-allegro.gtp"
        "${FIXTURES}/guitarpro2/pretty-woman.gtp"
        "${FIXTURES}/guitarpro3/notes.gp3"
        "${FIXTURES}/guitarpro4/effects.gp4"
        "${FIXTURES}/guitarpro5/nightwish.gp5"
        "${FIXTURES}/guitarpro6/serenade.gpx"
        "${FIXTURES}/guitarpro7/serenade.gp"
        "${FIXTURES}/guitarpro8/directions.gp"
        "${FIXTURES}/powertab/guitar_ins.ptb"
        "${FIXTURES}/tabledit/guitar_bass.tef"
        "${FIXTURES}/midi/anna-magdalena-04-guitar.mid"
    )
fi

pkill -x GPEditor 2>/dev/null || true
passed=0
failed=0
for file in "${files[@]}"; do
    name="$(basename "$file")"
    if [[ ! -f "$file" ]]; then
        echo "[e2e] skip ${name}: missing"
        continue
    fi
    since="$(date '+%Y-%m-%d %H:%M:%S')"
    open -a "$APP" "$file"
    loaded=false
    for _ in $(seq 1 "$TIMEOUT_TICKS"); do
        if log show --start "$since" --style compact \
            --predicate "process == \"GPEditor\" AND eventMessage CONTAINS \"window title: ${name}\"" 2>/dev/null |
            grep -q "window title: ${name}"; then
            loaded=true
            break
        fi
        sleep 0.5
    done
    if [[ "$loaded" == true ]] && pgrep -x GPEditor >/dev/null; then
        echo "[e2e] ok ${name}"
        passed=$((passed + 1))
    else
        echo "[e2e] FAIL ${name}: $([[ "$loaded" == true ]] && echo 'app exited after loading' || echo 'not loaded (parse error or crash)')"
        failed=$((failed + 1))
    fi
done
pkill -x GPEditor 2>/dev/null || true

echo "[e2e] summary: ${passed} ok / ${failed} failed"
[[ $failed -eq 0 ]]
