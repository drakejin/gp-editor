// Reads every gp-core fixture inside the Hermes engine the app ships with.
// Run through ./run.sh, which generates fixtures.generated.js and bundles this file with Metro.
import { readSong } from '@gp-editor/core';
import { base64ToBytes } from '../../src/lib/base64';
import FIXTURES from './fixtures.generated';

const failures = [];
let notes = 0;
for (const fixture of FIXTURES) {
  try {
    const song = readSong(base64ToBytes(fixture.base64));
    for (const track of song.tracks) {
      for (const measure of track.measures) {
        for (const beat of measure.beats) {
          for (const voice of beat.voices) {
            notes += voice.notes.length;
          }
        }
      }
    }
  } catch (error) {
    failures.push(`${fixture.name}: ${error && error.message ? error.message : String(error)}`);
  }
}
// eslint-disable-next-line no-undef
print(JSON.stringify({ files: FIXTURES.length, failed: failures.length, notes, failures }, null, 2));
