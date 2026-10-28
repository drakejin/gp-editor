#!/usr/bin/env bash
# Glyph ink: writes src/score/symbols/glyph-ink.ts — how far above and below its baseline each music glyph the engravers
# draw reaches, measured with CoreText in the bundled Bravura — so the score's bands make room for exactly what is drawn
# (`score/ink.ts`). The glyphs are found in src/ (`scan.mjs`); run it again when an engraver draws a new glyph.
# Usage: scripts/glyph-ink/run.sh   (from apps/desktop; Node and clang)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/glyph-ink"
OUT="${APP_DIR}/macos/build/glyph-ink"
mkdir -p "$OUT"

clang -fobjc-arc -fmodules -Wall -Werror "$HERE/glyph-ink.m" -framework CoreText -framework Foundation -o "$OUT/glyph-ink"
node "$HERE/scan.mjs" "$APP_DIR/src" \
  | "$OUT/glyph-ink" "$APP_DIR/macos/GPEditor-macOS/Fonts/Bravura.otf" \
  | node "$HERE/write-table.mjs" "$APP_DIR/src/score/symbols/glyph-ink.ts"
echo "wrote src/score/symbols/glyph-ink.ts"
