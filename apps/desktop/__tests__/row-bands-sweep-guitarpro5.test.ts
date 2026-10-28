import { fixtureBandProblems } from '../test-support/band-collisions';

// Engraving every fixture in five layouts takes a while.
jest.setTimeout(120000);

it('lays out every row of the guitarpro5 fixtures with no band running into another', () => {
  expect(fixtureBandProblems(['guitarpro5'])).toEqual([]);
});
