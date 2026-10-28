#!/usr/bin/env bash
# MCP server check: builds the native half of the MCP server (GPMcpHttp, GPMcpListener, GPMcpServerCore and the log)
# with clang against a check program (mcp-check.m) and runs it over real loopback sockets — the request head and its
# limits (400, 411, 413, 431, 408, the connection cap), Expect: 100-continue, a request held until JS attaches (503 past
# the hold time), JS's answer written back, a web page's Origin or a DNS-rebound Host refused with 403 before JS sees it,
# 504 when JS does not answer, 503 past 16 requests waiting, 503 for what JS was given when it goes, a port in use, and
# nothing listening off the loopback.
# Its home is a temporary folder (CFFIXED_USER_HOME), so the log file it writes is never the app's.
# Usage: scripts/mcp-check/run.sh   (from apps/desktop; nothing else needed)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/mcp-check"
SRC="${APP_DIR}/macos/GPEditor-macOS"
OUT="${APP_DIR}/macos/build/mcp-check"
mkdir -p "$OUT"

clang -fobjc-arc -fmodules -Wall -Werror -I "$SRC" \
    "$SRC/GPMcpHttp.m" "$SRC/GPMcpListener.m" "$SRC/GPMcpServerCore.m" "$SRC/GPMcpLog.m" "$SRC/GPMcpSettings.m" \
    "$SRC/GPAppStrings.m" "$SRC/GPEditorNotifications.m" "$SRC/GPSandbox.m" "$HERE/mcp-check.m" \
    -framework Foundation -framework Network -framework Security -o "$OUT/mcp-check"

HOME_DIR="$(mktemp -d)"
trap 'rm -rf "$HOME_DIR"' EXIT
# A port of its own, away from the app's default (18256) and a running QA copy's.
PORT=$((41000 + RANDOM % 2000))
CFFIXED_USER_HOME="$HOME_DIR" GPEDITOR_MCP_PORT="$PORT" "$OUT/mcp-check" "$PORT"
