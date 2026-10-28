import { type JsonSchema, schemaProblem } from '../src/mcp/json-schema';

const NOTE: JsonSchema = {
  type: 'object',
  properties: {
    string: { type: 'integer', minimum: 1, maximum: 10 },
    fret: { type: 'integer', minimum: 0, maximum: 29 },
    name: { type: 'string', minLength: 1, maxLength: 5 },
    view: { type: 'string', enum: ['tab', 'notation'] },
    speed: { type: 'number', minimum: 0.25 },
    advance: { type: 'boolean' },
    bars: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 2 },
  },
  required: ['string', 'fret'],
  additionalProperties: false,
};

describe('schemaProblem', () => {
  it('accepts arguments that fit the schema', () => {
    expect(schemaProblem(NOTE, { string: 1, fret: 0, name: 'Lead', view: 'tab', speed: 0.5, advance: true, bars: [1, 2] })).toBeUndefined();
  });

  it.each([
    ['a missing required property', { fret: 3 }, 'arguments.string is required'],
    ['a property the schema does not name', { string: 1, fret: 3, colour: 'red' }, 'arguments.colour is not a known argument'],
    ['a fraction where an integer is asked', { string: 1.5, fret: 3 }, 'arguments.string must be an integer'],
    ['a number below the minimum', { string: 0, fret: 3 }, 'arguments.string must be at least 1'],
    ['a number above the maximum', { string: 1, fret: 30 }, 'arguments.fret must be at most 29'],
    ['a string for a number', { string: '1', fret: 3 }, 'arguments.string must be an integer'],
    ['a value outside the enum', { string: 1, fret: 3, view: 'score' }, 'arguments.view must be one of "tab", "notation"'],
    ['a string too short', { string: 1, fret: 3, name: '' }, 'arguments.name must have at least 1 character'],
    ['a string too long', { string: 1, fret: 3, name: 'Rhythm' }, 'arguments.name must have at most 5 characters'],
    ['a wrong item in an array', { string: 1, fret: 3, bars: [1, 'x'] }, 'arguments.bars[1] must be an integer'],
    ['too many items', { string: 1, fret: 3, bars: [1, 2, 3] }, 'arguments.bars must have at most 2 items'],
    ['a non-finite number', { string: 1, fret: 3, speed: Infinity }, 'arguments.speed must be a number'],
    ['a boolean given as text', { string: 1, fret: 3, advance: 'yes' }, 'arguments.advance must be a boolean'],
  ])('names %s', (_, value, problem) => {
    expect(schemaProblem(NOTE, value)).toBe(problem);
  });

  it('asks for an object at the top', () => {
    expect(schemaProblem(NOTE, [1])).toBe('arguments must be an object');
    expect(schemaProblem(NOTE, null)).toBe('arguments must be an object');
  });

  it('accepts an empty object for a schema without properties', () => {
    expect(schemaProblem({ type: 'object', properties: {}, additionalProperties: false }, {})).toBeUndefined();
  });
});
