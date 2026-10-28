import { fixtureBandProblems } from '../test-support/band-collisions';

// Engraving every fixture in five layouts takes a while.
jest.setTimeout(120000);

it('lays out every row of the musicxml, powertab, tabledit, midi fixtures with no band running into another', () => {
  expect(fixtureBandProblems(['musicxml', 'powertab', 'tabledit', 'midi'])).toEqual([]);
});
