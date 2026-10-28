import { fixtureBandProblems } from '../test-support/band-collisions';

// Engraving every fixture in five layouts takes a while.
jest.setTimeout(120000);

it('lays out every row of the guitarpro6, guitarpro7, guitarpro8 fixtures with no band running into another', () => {
  expect(fixtureBandProblems(['guitarpro6', 'guitarpro7', 'guitarpro8'])).toEqual([]);
});
