#!/usr/bin/env bash
# Runs a QA script (see macos/GPEditor-macOS/GPQADriver.m) against an unsandboxed copy of the Release app and
# waits for it to quit. Snapshots go wherever the script's "snapshot" steps say.
# Usage: scripts/qa/run.sh <script.json>
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_APP="${APP_DIR}/macos/build/DerivedData/Build/Products/Release/GPEditor.app"
QA_APP="${APP_DIR}/macos/build/qa/GPEditor-QA.app"
ENTITLEMENTS="${APP_DIR}/macos/GPEditor-macOS/GPEditor-QA.entitlements"
TIMEOUT_SECONDS=180

[[ $# -eq 1 ]] || { echo "usage: $(basename "$0") <script.json>" >&2; exit 1; }
SCRIPT="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
[[ -d "$RELEASE_APP" ]] || { echo "[qa] error: build the Release app first (npm run build:macos)" >&2; exit 1; }

if [[ ! -d "$QA_APP" || "$RELEASE_APP/Contents/MacOS/GPEditor" -nt "$QA_APP/Contents/MacOS/GPEditor" ||
      "$RELEASE_APP/Contents/Resources/main.jsbundle" -nt "$QA_APP/Contents/Resources/main.jsbundle" ]]; then
    rm -rf "$QA_APP"
    mkdir -p "$(dirname "$QA_APP")"
    cp -R "$RELEASE_APP" "$QA_APP"
    codesign --force --deep --sign - --entitlements "$ENTITLEMENTS" "$QA_APP" >/dev/null 2>&1
    echo "[qa] prepared ${QA_APP}"
fi

pkill -x GPEditor 2>/dev/null || true
GPEDITOR_QA_SCRIPT="$SCRIPT" "$QA_APP/Contents/MacOS/GPEditor" >/dev/null 2>&1 &
pid=$!
for _ in $(seq 1 "$TIMEOUT_SECONDS"); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
done
if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "[qa] timeout after ${TIMEOUT_SECONDS}s" >&2
fi
cat "${SCRIPT}.log"
