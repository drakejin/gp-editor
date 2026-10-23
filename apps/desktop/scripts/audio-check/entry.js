// Renders the audio check's songs to MIDI inside Hermes, as playback does (renderMidi), and prints them as JSON
// ({ name: base64 }). Run through ./run.sh, which generates fixtures.generated.js and bundles this file with Metro.
import { readSong, renderMidi } from '@gp-editor/core';
import { base64ToBytes, bytesToBase64 } from '../../src/lib/base64';
import FIXTURES from './fixtures.generated';

const midi = {};
for (const fixture of FIXTURES) {
  midi[fixture.name] = bytesToBase64(renderMidi(readSong(base64ToBytes(fixture.base64))).bytes);
}
// eslint-disable-next-line no-undef
print(JSON.stringify(midi));
