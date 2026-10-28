#!/usr/bin/env bash
# Audio check: renders songs offline through the playback engine's effects (GPMixRenderer, manual rendering mode) and
# measures what each effect changes; also checks that a mix without effects renders as playback did before effects,
# the audio track (time-pitch at half speed, detune, gain, the runs' sync), and prints how fast many-track songs render.
# The songs' MIDI comes from gp-core's renderMidi, run in Hermes.
# Then the engine (engine-check.m): the playback engine in real time, in the App Sandbox as the shipped app runs it —
# signed with GPEditor.entitlements under an identifier of its own, ENGINE_CHECK_ID (its container under
# ~/Library/Containers keeps the bank and the song while it runs; the container itself stays) —, every effect made, a
# drum kit the bank lacks, and the effects UI's actions at random.
# Then the audio export (export-check.m): a fixture written by GPAudioExporter as WAV, AIFF, FLAC, MP3 and Ogg Vorbis
# and read back (scripts/audio-codecs/fetch.sh builds the MP3 and Vorbis encoders first; cached).
# Usage: scripts/audio-check/run.sh [effects|engine|export]   (from apps/desktop; needs npm run pods and npm run soundfont
# first; no argument runs all three)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="${APP_DIR}/scripts/audio-check"
SRC="${APP_DIR}/macos/GPEditor-macOS"
FIXTURES="${APP_DIR}/../../packages/gp-core/test/fixtures"
HERMES="${APP_DIR}/macos/Pods/hermes-engine/destroot/bin/hermes"
BANK="${SRC}/SoundFonts/GeneralUser-GS.sf2"
CODECS="${APP_DIR}/macos/ThirdParty/audio-codecs"
OUT="${APP_DIR}/macos/build/audio-check"
WHICH="${1:-all}"

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
for (const [name, { base64, seconds }] of Object.entries(JSON.parse(fs.readFileSync(json, "utf8")))) {
  fs.writeFileSync(path.join(out, name + ".mid"), Buffer.from(base64, "base64"));
  fs.writeFileSync(path.join(out, name + ".seconds"), String(seconds));
}
' "${OUT}/midi.json" "$OUT"

RENDER_SOURCES=("${SRC}/GPConvolver.m" "${SRC}/GPCabinetImpulses.m" "${SRC}/GPDSPKernels.m" "${SRC}/GPDSPUnit.m"
    "${SRC}/GPEffectNodes.m" "${SRC}/GPMixGraph.m" "${SRC}/GPTrackInstruments.m" "${SRC}/GPMixRenderer.m"
    "${SRC}/GPAudioAssets.m" "${SRC}/GPAudioTrackPlayer.m" "${HERE}/audio-measures.m"
    "${SRC}/GPAppStrings.m")  # GPLocalizedString of the errors (English here: no .lproj in the tool)

if [[ "$WHICH" == "all" || "$WHICH" == "effects" ]]; then
    clang -fobjc-arc -fmodules -O2 -Wall -I "$SRC" -I "$HERE" "${RENDER_SOURCES[@]}" "${HERE}/audio-track-check.m" "${HERE}/audio-check.m" \
        -o "${OUT}/audio-check"
    "${OUT}/audio-check" "$BANK" "${OUT}/song.mid" "${OUT}/twelve.mid" "${OUT}/bends.mid"
fi

ENGINE_CHECK_ID="com.drakejin.gpeditor.audio-check"
# The audio units' own chatter on stderr; anything else (an exception, a crash) still shows.
UNIT_NOISE='EnvelopeState|AudioConverter|SamplerUtils|AUSampler|throwing -10'

if [[ "$WHICH" == "all" || "$WHICH" == "engine" ]]; then
    printf '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>%s</string></dict></plist>\n' \
        "$ENGINE_CHECK_ID" > "${OUT}/engine-check-info.plist"
    clang -fobjc-arc -fmodules -O2 -Wall -I "$SRC" -I "$HERE" "${RENDER_SOURCES[@]}" "${SRC}/GPLineIn.m" "${SRC}/GPSandbox.m" \
        "${SRC}/GPMidiEngine.m" "${HERE}/engine-stress.m" "${HERE}/engine-check.m" \
        -Wl,-sectcreate,__TEXT,__info_plist,"${OUT}/engine-check-info.plist" -o "${OUT}/engine-check"
    codesign --force --sign - --identifier "$ENGINE_CHECK_ID" --entitlements "${SRC}/GPEditor.entitlements" "${OUT}/engine-check"
    CONTAINER_HOME="$("${OUT}/engine-check")"
    mkdir -p "${CONTAINER_HOME}/audio-check"
    cp "$BANK" "${OUT}/song.mid" "${CONTAINER_HOME}/audio-check/"
    status=0
    "${OUT}/engine-check" "${CONTAINER_HOME}/audio-check/$(basename "$BANK")" "${CONTAINER_HOME}/audio-check/song.mid" \
        2> >(grep -v -E "$UNIT_NOISE" >&2) || status=$?
    rm -rf "${CONTAINER_HOME}/audio-check"
    (( status == 0 )) || exit "$status"
fi

if [[ "$WHICH" == "all" || "$WHICH" == "export" ]]; then
    "${APP_DIR}/scripts/audio-codecs/fetch.sh"
    clang -fobjc-arc -fmodules -O2 -Wall -I "$SRC" -I "$HERE" -I "${CODECS}/include" "${RENDER_SOURCES[@]}" \
        "${SRC}/GPAudioFileWriter.m" "${SRC}/GPMp3Writer.m" "${SRC}/GPVorbisWriter.m" "${SRC}/GPAudioExporter.m" "${HERE}/export-check.m" \
        -L "${CODECS}/lib" -lmp3lame -lvorbisfile -lvorbisenc -lvorbis -logg -o "${OUT}/export-check"
    mkdir -p "${OUT}/export"
    "${OUT}/export-check" "$BANK" "${OUT}/bends.mid" "$(cat "${OUT}/bends.seconds")" "${OUT}/export"
fi
