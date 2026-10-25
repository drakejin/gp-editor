#!/usr/bin/env bash
# Painter check: builds GPCommandPainter (the canvas's, the PDF's and the PNG's drawing) with clang against a check
# program (painter-check.m) and runs it — a text AppKit makes no font for is left out of that drawing, not an exception
# (which AppKit turns into a crash inside -drawRect:), and the next drawing draws it.
# Usage: scripts/painter-check/run.sh   (from apps/desktop; nothing else needed)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/painter-check"
SRC="${APP_DIR}/macos/GPEditor-macOS"
OUT="${APP_DIR}/macos/build/painter-check"
mkdir -p "$OUT"

clang -fobjc-arc -fmodules -Wall -Werror -I "$SRC" "$SRC/GPCommandPainter.m" "$HERE/painter-check.m" \
    -framework AppKit -framework CoreText -o "$OUT/painter-check"
"$OUT/painter-check"
