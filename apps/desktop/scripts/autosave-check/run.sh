#!/usr/bin/env bash
# Autosave check: builds GPAutosave.m (autosave's files: Application Support/GPEditor/Autosave/<day>/<document>/
# snapshot.gp + manifest.json) with clang against autosave-check.m and a stub of React's module header, and checks
# that a snapshot and its manifest are written whole and replaced in place, that no folder name from JS can reach outside
# the autosave folder, that the list reads only well-named folders, that old days are removed and newer ones kept,
# and that a process that ended is told from one that runs.
# Its home is a temporary folder (CFFIXED_USER_HOME): it stops unless Application Support is inside it.
# Usage: scripts/autosave-check/run.sh   (from apps/desktop; nothing else needed)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/autosave-check"
SRC="${APP_DIR}/macos/GPEditor-macOS"
OUT="${APP_DIR}/macos/build/autosave-check"
mkdir -p "$OUT"

clang -fobjc-arc -fmodules -Wall -Werror -I "$HERE/stub" -I "$SRC" \
    "$SRC/GPAutosave.m" "$SRC/GPAppStrings.m" "$SRC/GPEditorNotifications.m" "$HERE/autosave-check.m" \
    -framework AppKit -o "$OUT/autosave-check"

HOME_DIR="$(mktemp -d)"
trap 'rm -rf "$HOME_DIR"' EXIT
CFFIXED_USER_HOME="$HOME_DIR" "$OUT/autosave-check"
