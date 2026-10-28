#!/usr/bin/env bash
# Messages API check: builds GPAnthropic.m (the PDF import's and the Song Writer's calls) with clang against a check
# program (anthropic-check.m) and a stub of React's module header, and runs it against a mock Messages API on a
# loopback port with a 1.5 s idle timeout in place of the app's 600 s: a streamed answer that flows for three idle
# timeouts comes in whole, with its content type; the same answer sent silently (as an answer that is not streamed)
# times out; a stream that stops times out; an HTTP error comes as JSON with its status; the whole-answer limit ends
# even a flowing stream; the request carries the key and the API version.
# Its home is a temporary folder (CFFIXED_USER_HOME), so the key it saves is never the user's.
# Usage: scripts/anthropic-check/run.sh   (from apps/desktop; nothing else needed)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/anthropic-check"
SRC="${APP_DIR}/macos/GPEditor-macOS"
OUT="${APP_DIR}/macos/build/anthropic-check"
mkdir -p "$OUT"

clang -fobjc-arc -fmodules -Wall -Werror -I "$HERE/stub" -I "$SRC" \
    "$SRC/GPAnthropic.m" "$SRC/GPAppStrings.m" "$SRC/GPEditorNotifications.m" "$SRC/GPSandbox.m" "$HERE/anthropic-check.m" \
    -framework Foundation -framework Security -o "$OUT/anthropic-check"

HOME_DIR="$(mktemp -d)"
trap 'rm -rf "$HOME_DIR"' EXIT
# A port of its own, away from the MCP servers' (18256, 1837x) and the mcp-check's (41000–43000).
PORT=$((43000 + RANDOM % 2000))
CFFIXED_USER_HOME="$HOME_DIR" GPEDITOR_ANTHROPIC_URL="http://127.0.0.1:${PORT}/v1/messages" "$OUT/anthropic-check" "$PORT"
