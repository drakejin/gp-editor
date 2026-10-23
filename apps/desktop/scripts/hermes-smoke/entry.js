// Reads every gp-core fixture inside the Hermes engine the app ships with, saves it as GP5 the way ⌘S does
// (writeSong → base64) and as Guitar Pro 7 ('gp'), and reads the saved bytes back.
// Run through ./run.sh, which generates fixtures.generated.js and bundles this file with Metro.
import { readSong, writeSong } from '@gp-editor/core';
import { base64ToBytes, bytesToBase64 } from '../../src/lib/base64';
import FIXTURES from './fixtures.generated';

function countNotes(song) {
  let count = 0;
  for (const track of song.tracks) {
    for (const measure of track.measures) {
      for (const beat of measure.beats) {
        for (const voice of beat.voices) {
          count += voice.notes.length;
        }
      }
    }
  }
  return count;
}

function errorText(error) {
  return error && error.message ? error.message : String(error);
}

function saveAndReread(song, format) {
  const reread = readSong(
    base64ToBytes(bytesToBase64(writeSong(song, format))),
  );
  if (
    reread.tracks.length !== song.tracks.length ||
    reread.measureHeaders.length !== song.measureHeaders.length
  ) {
    throw new Error(
      `saved ${reread.tracks.length} tracks / ${reread.measureHeaders.length} bars`,
    );
  }
}

const failures = [];
let notes = 0;
let saved = 0;
let savedGp = 0;
for (const fixture of FIXTURES) {
  let song;
  try {
    song = readSong(base64ToBytes(fixture.base64));
    notes += countNotes(song);
  } catch (error) {
    failures.push(`${fixture.name}: read: ${errorText(error)}`);
    continue;
  }
  try {
    saveAndReread(song, 'gp5');
    saved += 1;
  } catch (error) {
    failures.push(`${fixture.name}: save: ${errorText(error)}`);
  }
  try {
    saveAndReread(song, 'gp');
    savedGp += 1;
  } catch (error) {
    failures.push(`${fixture.name}: save as gp: ${errorText(error)}`);
  }
}
// eslint-disable-next-line no-undef
print(
  JSON.stringify(
    {
      files: FIXTURES.length,
      failed: failures.length,
      notes,
      saved,
      savedGp,
      failures,
    },
    null,
    2,
  ),
);
