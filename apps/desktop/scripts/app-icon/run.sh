#!/usr/bin/env bash
# App icon: draws the icon with CoreGraphics (icon-art.swift: a bar of tab drawn as a guitar's neck, the editor's
# orange-brown cursor on one string) and writes every file of it — the macOS AppIcon set (16 to 512 points at 1x and
# 2x, and its Contents.json) and the Windows bundle's icons (src-tauri/icons: 32x32, 128x128, 128x128@2x, icon.png and
# icon.ico with 16, 24, 32, 48, 64 and 256). Each size is drawn on its own: the small ones with fewer, thicker lines.
# Usage: scripts/app-icon/run.sh [--sheet <out.png>]   (from anywhere; the Xcode command line tools)
#   --sheet  writes a contact sheet of every size on light and dark backgrounds instead of the icon files
set -euo pipefail

# Anything but no argument or --sheet <out.png> is refused: a mistyped option must not rewrite the tracked icons.
case "$#:${1:-}" in
  0:) MODE=write ;;
  2:--sheet) MODE=sheet ;;
  *) echo "usage: $0 [--sheet <out.png>]" >&2; exit 2 ;;
esac

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/app-icon"
OUT="${APP_DIR}/macos/build/app-icon"
mkdir -p "$OUT"

swiftc -O "$HERE/icon-geometry.swift" "$HERE/icon-art.swift" "$HERE/icon-parts.swift" "$HERE/icon-files.swift" \
  "$HERE/icon-sheet.swift" "$HERE/main.swift" -o "$OUT/app-icon"

if [[ "$MODE" == write ]]; then
  "$OUT/app-icon" write "$APP_DIR"
  echo "wrote the AppIcon set and src-tauri/icons"
else
  "$OUT/app-icon" sheet "$2"
  echo "wrote $2"
fi
