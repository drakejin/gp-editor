#!/usr/bin/env bash
# Hermes smoke test: bundle gp-core with Metro, then read every fixture and save it as GP5 in the Hermes VM from the macOS pods.
# Usage: scripts/hermes-smoke/run.sh   (from apps/desktop; needs `npm run pods` first)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/hermes-smoke"
FIXTURES="${APP_DIR}/../../packages/gp-core/test/fixtures"
HERMES="${APP_DIR}/macos/Pods/hermes-engine/destroot/bin/hermes"
OUT="${APP_DIR}/macos/build/hermes-smoke"

if [[ ! -x "$HERMES" ]]; then
    echo "[hermes-smoke] error: ${HERMES} not found — run npm run pods first" >&2
    exit 1
fi
mkdir -p "$OUT"

node -e '
const fs = require("fs"), path = require("path");
const root = process.argv[1];
const entries = fs.readdirSync(root).filter((d) => d.startsWith("guitarpro") || d === "musicxml").sort().flatMap((dir) =>
  fs.readdirSync(path.join(root, dir)).filter((f) => !f.startsWith(".")).sort().map((f) => ({
    name: `${dir}/${f}`, base64: fs.readFileSync(path.join(root, dir, f)).toString("base64") })));
fs.writeFileSync(process.argv[2], "export default " + JSON.stringify(entries) + ";\n");
' "$FIXTURES" "${HERE}/fixtures.generated.js"

(cd "$APP_DIR" && npx react-native bundle --platform macos --dev false --minify false \
    --entry-file scripts/hermes-smoke/entry.js --bundle-output "${OUT}/smoke.js" >/dev/null)
rm -f "${HERE}/fixtures.generated.js"

"$HERMES" "${OUT}/smoke.js" | tee "${OUT}/result.json"
node -e 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).failed === 0 ? 0 : 1)' "${OUT}/result.json"
