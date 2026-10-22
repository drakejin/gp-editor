#!/usr/bin/env bash
# Fetches the GeneralUser GS SoundFont (S. Christian Collins, free for use in software — see
# macos/GPEditor-macOS/SoundFonts/GeneralUser-GS-LICENSE.txt) the app plays with by default. It is 32 MB, so it is
# downloaded at a pinned commit and checked instead of committed. Without it the app falls back to the macOS sounds.
# Usage: scripts/soundfont/fetch.sh   (npm run build:macos runs it)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${APP_DIR}/macos/GPEditor-macOS/SoundFonts/GeneralUser-GS.sf2"
# GeneralUser GS v2.0.3, github.com/mrbumpy409/GeneralUser-GS at 684543d (2026-02-23).
URL="https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/684543d5e5efaef08d02be50dcda8d552478fa60/GeneralUser-GS.sf2"
SHA256="9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe"

checksum() { shasum -a 256 "$1" | cut -d' ' -f1; }

if [[ -f "$DEST" && "$(checksum "$DEST")" == "$SHA256" ]]; then
    exit 0
fi
TMP="$(mktemp "${DEST}.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
echo "[soundfont] downloading GeneralUser GS (32 MB)…"
curl --fail --silent --show-error --location --retry 4 --retry-delay 2 --output "$TMP" "$URL"
if [[ "$(checksum "$TMP")" != "$SHA256" ]]; then
    echo "[soundfont] error: checksum mismatch for ${URL}" >&2
    exit 1
fi
# mktemp files are owner-only; the bundle must be readable by every account that runs the app.
chmod 644 "$TMP"
mv "$TMP" "$DEST"
trap - EXIT
echo "[soundfont] saved ${DEST}"
