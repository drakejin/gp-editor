#!/usr/bin/env bash
# Audio check: renders songs offline through the playback engine's effects (GPMixRenderer, manual rendering mode) and
# measures what each effect changes; also checks that a mix without effects renders as playback did before effects,
# the audio track (time-pitch at half speed, detune, gain, the runs' sync), and prints how fast many-track songs render. The songs' MIDI comes from gp-core's renderMidi, run in Hermes.
# Usage: scripts/audio-check/run.sh   (from apps/desktop; needs npm run pods and npm run soundfont first)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/audio-check"
SRC="${APP_DIR}/macos/GPEditor-macOS"
FIXTURES="${APP_DIR}/../../packages/gp-core/test/fixtures"
HERMES="${APP_DIR}/macos/Pods/hermes-engine/destroot/bin/hermes"
BANK="${SRC}/SoundFonts/GeneralUser-GS.sf2"
OUT="${APP_DIR}/macos/build/audio-check"

for needed in "$HERMES" "$BANK"; do
    if [[ ! -e "$needed" ]]; then
        echo "[audio-check] error: ${needed} not found — run npm run pods and npm run soundfont first" >&2
        exit 1
    fi
done
mkdir -p "$OUT"

# The songs as playback renders them: an 11-track song, a 12-track one, and bends.
node -e '
const fs = require("fs"), path = require("path");
const [root, out] = process.argv.slice(1);
const songs = { song: "guitarpro5/nightwish.gp5", twelve: "guitarpro8/transposition-tonality-c.gp", bends: "guitarpro5/bends.gp5" };
const entries = Object.entries(songs).map(([name, file]) => ({ name, base64: fs.readFileSync(path.join(root, file)).toString("base64") }));
fs.writeFileSync(out, "export default " + JSON.stringify(entries) + ";\n");
' "$FIXTURES" "${HERE}/fixtures.generated.js"
(cd "$APP_DIR" && npx react-native bundle --platform macos --dev false --minify false \
    --entry-file scripts/audio-check/entry.js --bundle-output "${OUT}/midi.js" >/dev/null)
rm -f "${HERE}/fixtures.generated.js"
"$HERMES" "${OUT}/midi.js" > "${OUT}/midi.json"
node -e '
const fs = require("fs"), path = require("path");
const [json, out] = process.argv.slice(1);
for (const [name, base64] of Object.entries(JSON.parse(fs.readFileSync(json, "utf8")))) {
  fs.writeFileSync(path.join(out, name + ".mid"), Buffer.from(base64, "base64"));
}
' "${OUT}/midi.json" "$OUT"

clang -fobjc-arc -fmodules -O2 -Wall -I "$SRC" -I "$HERE" \
    "${SRC}/GPConvolver.m" "${SRC}/GPCabinetImpulses.m" "${SRC}/GPDSPKernels.m" "${SRC}/GPDSPUnit.m" \
    "${SRC}/GPEffectNodes.m" "${SRC}/GPMixGraph.m" "${SRC}/GPTrackInstruments.m" "${SRC}/GPMixRenderer.m" \
    "${SRC}/GPAudioAssets.m" "${SRC}/GPAudioTrackPlayer.m" \
    "${HERE}/audio-measures.m" "${HERE}/audio-track-check.m" "${HERE}/audio-check.m" -o "${OUT}/audio-check"
"${OUT}/audio-check" "$BANK" "${OUT}/song.mid" "${OUT}/twelve.mid" "${OUT}/bends.mid"
