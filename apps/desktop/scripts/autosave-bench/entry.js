// How long an autosave snapshot holds the JS thread, in the Hermes engine the app ships with: writeSong 'gp' (the
// snapshot, as autosave-writes.ts makes it; a .gp file with an audio track embeds its recording) and its base64 for the
// bridge, on the biggest fixtures, a few times each. Run through ./run.sh, which bundles this file with Metro.
import { readSongFile, writeSong } from '@gp-editor/core';
import { base64ToBytes, bytesToBase64 } from '../../src/lib/base64';
import FIXTURES from './fixtures.generated';

const RUNS = 5;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const results = FIXTURES.map((fixture) => {
  const { song, audioTrackData } = readSongFile(base64ToBytes(fixture.base64));
  const options = audioTrackData === undefined ? undefined : { audioTrackData };
  const write = [];
  const encode = [];
  let base64Length = 0;
  for (let run = 0; run < RUNS; run++) {
    const start = Date.now();
    const bytes = writeSong(song, 'gp', options);
    const written = Date.now();
    base64Length = bytesToBase64(bytes).length;
    write.push(written - start);
    encode.push(Date.now() - written);
  }
  return { name: fixture.name, tracks: song.tracks.length, bars: song.measureHeaders.length, writeSongMs: median(write), base64Ms: median(encode), base64Length };
});
// eslint-disable-next-line no-undef
print(JSON.stringify(results, null, 1));
