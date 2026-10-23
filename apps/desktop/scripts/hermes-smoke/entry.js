// Reads every gp-core fixture inside the Hermes engine the app ships with, saves it as GP5 the way ⌘S does
// (writeSong → base64) and reads the saved bytes back; then writes it as ASCII tab (File ▸ Export ASCII Tab…).
// Run through ./run.sh, which generates fixtures.generated.js and bundles this file with Metro.
import { readSong, writeAsciiTab, writeSong } from '@gp-editor/core';
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

const failures = [];
let notes = 0;
let saved = 0;
let asciiTabs = 0;
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
    const reread = readSong(
      base64ToBytes(bytesToBase64(writeSong(song, 'gp5'))),
    );
    if (
      reread.tracks.length !== song.tracks.length ||
      reread.measureHeaders.length !== song.measureHeaders.length
    ) {
      throw new Error(
        `saved ${reread.tracks.length} tracks / ${reread.measureHeaders.length} bars`,
      );
    }
    saved += 1;
  } catch (error) {
    failures.push(`${fixture.name}: save: ${errorText(error)}`);
  }
  try {
    if (!writeAsciiTab(song).startsWith('Title:')) {
      throw new Error('no song heading');
    }
    asciiTabs += 1;
  } catch (error) {
    failures.push(`${fixture.name}: ASCII tab: ${errorText(error)}`);
  }
}
// eslint-disable-next-line no-undef
print(
  JSON.stringify(
    { files: FIXTURES.length, failed: failures.length, notes, saved, asciiTabs, failures },
    null,
    2,
  ),
);
