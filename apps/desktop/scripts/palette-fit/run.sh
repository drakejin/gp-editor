#!/usr/bin/env bash
# Palette fit: measures, with AppKit's system font, every text the edition palette draws (its faces and keys, in English
# and Korean) and writes test-support/palette-text-widths.ts, with which __tests__/palette-fit.test.ts lays the palette
# out to check every group shows without scrolling at the default 1280 × 800 window. Run it again when a palette face or
# key changes (the test names the texts it lacks).
# Usage: scripts/palette-fit/run.sh   (from apps/desktop; Node and the Xcode command line tools)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/palette-fit"
OUT="${APP_DIR}/macos/build/palette-fit"
mkdir -p "$OUT"
rm -f "$OUT/texts.json"

swiftc -O "$HERE/measure-texts.swift" -o "$OUT/measure-texts"
# The test writes the texts it needs before it checks anything; it fails while some are not measured yet.
(cd "$APP_DIR" && PALETTE_FIT_TEXTS="$OUT/texts.json" npx jest __tests__/palette-fit.test.ts > "$OUT/jest.log" 2>&1 || true)
[[ -s "$OUT/texts.json" ]] || { echo "the palette fit test wrote no texts (see $OUT/jest.log)" >&2; exit 1; }
"$OUT/measure-texts" "$OUT/texts.json" "$APP_DIR/test-support/palette-text-widths.ts"
echo "wrote test-support/palette-text-widths.ts"
