// Renders the audio check's songs to MIDI inside Hermes, as playback does (renderMidi), and prints them as JSON
// ({ name: { base64, seconds } }: the file and the song's length). Run through ./run.sh, which generates
// fixtures.generated.js and bundles this file with Metro.
import { readSong, renderMidi } from '@gp-editor/core';
import { base64ToBytes, bytesToBase64 } from '../../src/lib/base64';
import FIXTURES from './fixtures.generated';

const midi = {};
for (const fixture of FIXTURES) {
  const render = renderMidi(readSong(base64ToBytes(fixture.base64)));
  midi[fixture.name] = { base64: bytesToBase64(render.bytes), seconds: render.durationSeconds };
}
// eslint-disable-next-line no-undef
print(JSON.stringify(midi));
