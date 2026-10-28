import { fixtureBandProblems } from '../test-support/band-collisions';

// Engraving every fixture in five layouts takes a while.
jest.setTimeout(120000);

it('lays out every row of the guitarpro1, guitarpro2, guitarpro3, guitarpro4 fixtures with no band running into another', () => {
  expect(fixtureBandProblems(['guitarpro1', 'guitarpro2', 'guitarpro3', 'guitarpro4'])).toEqual([]);
});
