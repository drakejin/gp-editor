import { type Annotation, type Song, readSong, setBeatAnnotation } from '@gp-editor/core';
import { songBandProblems } from '../test-support/band-collisions';
import { listFixtures, readFixture } from '../test-support/fixtures';

// Engraving every fixture in five layouts takes a while.
jest.setTimeout(240000);

const ABOVE: Annotation = { text: 'Watch the bend\nsofter the second time\n여기서 숨 쉬기', placement: 'above' };
const BELOW: Annotation = { text: 'palm mute from here (both guitars), then let ring', placement: 'below' };

/** Every track's first beats of bars 1, 2 and 5 annotated, above and below, and two neighbours in bar 3. */
function annotated(song: Song): Song {
  const places: readonly (readonly [number, number, Annotation])[] = [[0, 0, ABOVE], [1, 0, BELOW], [2, 0, ABOVE], [2, 1, ABOVE], [4, 0, BELOW]];
  return song.tracks.reduce(
    (tracksDone, _, trackIndex) => places.reduce((done, [measureIndex, beatIndex, annotation]) => setBeatAnnotation(done, { trackIndex, measureIndex, beatIndex, voiceIndex: 0 }, annotation), tracksDone),
    song,
  );
}

it('lays out the guitarpro5 fixtures, annotated over and under the staves, with no band running into another', () => {
  const problems = listFixtures('guitarpro5').flatMap((name) => songBandProblems(annotated(readSong(readFixture('guitarpro5', name)))).map((problem) => `${name} ${problem}`));
  expect(problems).toEqual([]);
});
