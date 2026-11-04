#!/usr/bin/env bash
# Autosave bench: how long making a snapshot of a big song holds the JS thread in the Hermes VM from the macOS pods
# (writeSong 'gp' and base64, the median of 5 runs) — why a due snapshot waits for a pause in the editing
# (src/autosave/autosave-schedule.ts). Prints JSON; no pass or fail.
# Usage: scripts/autosave-bench/run.sh   (from apps/desktop; needs `npm run pods` first)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/autosave-bench"
FIXTURES="${APP_DIR}/../../packages/gp-core/test/fixtures"
HERMES="${APP_DIR}/macos/Pods/hermes-engine/destroot/bin/hermes"
OUT="${APP_DIR}/macos/build/autosave-bench"

if [[ ! -x "$HERMES" ]]; then
    echo "[autosave-bench] error: ${HERMES} not found — run npm run pods first" >&2
    exit 1
fi
mkdir -p "$OUT"

node -e '
const fs = require("fs"), path = require("path");
const names = ["guitarpro5/canon.gp5", "guitarpro4/fade-to-black.gp4", "guitarpro5/nightwish.gp5", "guitarpro7/serenade.gp", "guitarpro8/canon-audio-track.gp"];
const entries = names.map((name) => ({ name, base64: fs.readFileSync(path.join(process.argv[1], name)).toString("base64") }));
fs.writeFileSync(process.argv[2], "export default " + JSON.stringify(entries) + ";\n");
' "$FIXTURES" "${HERE}/fixtures.generated.js"

(cd "$APP_DIR" && npx react-native bundle --platform macos --dev false --minify false \
    --entry-file scripts/autosave-bench/entry.js --bundle-output "${OUT}/bench.js" >/dev/null)
rm -f "${HERE}/fixtures.generated.js"

"$HERMES" -O "${OUT}/bench.js"
