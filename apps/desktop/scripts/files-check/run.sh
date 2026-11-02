#!/usr/bin/env bash
# Files check: builds GPFiles.m (Save's and the exports' writes) with clang against files-check.m and a stub of React's
# module headers, and checks that a read-only file (permissions, or Finder's lock) is refused and left as it was while
# other files are written as before. Its files are in a temporary folder of its own.
# Usage: scripts/files-check/run.sh   (from apps/desktop; nothing else needed)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/files-check"
SRC="${APP_DIR}/macos/GPEditor-macOS"
OUT="${APP_DIR}/macos/build/files-check"
mkdir -p "$OUT"

clang -fobjc-arc -fmodules -Wall -I "$HERE/stub" -I "$SRC" \
    "$SRC/GPFiles.m" "$SRC/GPAppStrings.m" "$SRC/GPEditorNotifications.m" "$SRC/GPSandbox.m" "$HERE/files-check.m" \
    -framework AppKit -framework UniformTypeIdentifiers -framework Security -o "$OUT/files-check"
"$OUT/files-check"
