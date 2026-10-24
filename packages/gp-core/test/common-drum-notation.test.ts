import { describe, expect, it } from 'vitest';
import { FACTORY_DRUM_KIT } from '../src/formats/common/drum-kit';
import { DRUM_KIT_NOTATIONS, DRUM_NOTEHEADS, drumNotation } from '../src/formats/common/drum-notation';

describe('drumNotation', () => {
  it.each([
    [35, 0, 'noteheadBlack', 'Acoustic Kick Drum', 'Kick (hit)'],
    [36, 1, 'noteheadBlack', 'Kick Drum', 'Kick (hit)'],
    [38, 5, 'noteheadBlack', 'Snare', 'Snare (hit)'],
    [37, 5, 'noteheadXBlack', 'Snare', 'Snare (side stick)'],
    [91, 5, 'noteheadDiamondWhite', 'Snare', 'Snare (rim shot)'],
    [42, 9, 'noteheadXBlack', 'Charley', 'Hi-Hat (closed)'],
    [92, 9, 'noteheadCircleSlash', 'Charley', 'Hi-Hat (half)'],
    [46, 9, 'noteheadCircleX', 'Charley', 'Hi-Hat (open)'],
    [44, -1, 'noteheadXBlack', 'Charley', 'Pedal Hi-Hat (hit)'],
    [43, 2, 'noteheadBlack', 'Tom Very Low', 'Very Low Tom (hit)'],
    [50, 7, 'noteheadBlack', 'Tom Very High', 'High Floor Tom (hit)'],
    [51, 8, 'noteheadXBlack', 'Ride', 'Ride (middle)'],
    [53, 8, 'noteheadDiamondWhite', 'Ride', 'Ride (bell)'],
    [49, 10, 'noteheadHeavyX', 'Crash High', 'Crash high (hit)'],
    [57, 9, 'noteheadHeavyX', 'Crash Medium', 'Crash medium (hit)'],
    [52, 11, 'noteheadHeavyXHat', 'China', 'China (hit)'],
    [55, 10, 'noteheadXBlack', 'Splash', 'Splash (hit)'],
    [56, 8, 'noteheadTriangleUpBlack', 'Cowbell Medium', 'Cowbell medium (hit)'],
  ])('writes key %i on position %i with %s (%s, %s)', (key, position, black, elementName, articulationName) => {
    // Act
    const notation = drumNotation(key);

    // Assert: Guitar Pro 7's factory kit, its staff line counted from the top line down.
    expect(notation).toMatchObject({ key, position, elementName, articulationName });
    expect(notation?.noteheads.black).toBe(black);
  });

  it('gives each duration its notehead', () => {
    expect(drumNotation(38)?.noteheads).toEqual({ black: 'noteheadBlack', half: 'noteheadHalf', whole: 'noteheadWhole' });
    expect(drumNotation(100)?.noteheads).toEqual({ black: 'noteheadXBlack', half: 'noteheadXHalf', whole: 'noteheadXWhole' });
    expect(drumNotation(42)?.noteheads).toEqual({ black: 'noteheadXBlack', half: 'noteheadXBlack', whole: 'noteheadXBlack' });
  });

  it('keeps the technique symbols and where Guitar Pro writes them', () => {
    expect(drumNotation(93)?.technique).toEqual({ symbol: 'pictEdgeOfCymbal', placement: 'above' });
    expect(drumNotation(94)?.technique).toEqual({ symbol: 'articStaccatoAbove', placement: 'outside' });
    expect(drumNotation(104)?.technique).toEqual({ symbol: 'noteheadParenthesis', placement: 'inside' });
    expect(drumNotation(124)?.technique).toEqual({ symbol: 'guitarGolpe', placement: 'below' });
    expect(drumNotation(42)?.technique).toBeUndefined();
  });

  it('plays an articulation id on its General MIDI key', () => {
    expect(drumNotation(92)).toMatchObject({ outputKey: 46, elementType: 'hiHat' });
    expect(drumNotation(42)).toMatchObject({ outputKey: 42, elementType: 'hiHat' });
  });

  it('knows nothing of keys the kit lacks', () => {
    expect(drumNotation(27)).toBeUndefined();
    expect(drumNotation(128)).toBeUndefined();
    expect(drumNotation(Number.NaN)).toBeUndefined();
  });

  it('takes the first articulation of a key two elements share', () => {
    expect(drumNotation(83)?.elementName).toBe('Jingle Bell');
  });
});

describe('DRUM_KIT_NOTATIONS', () => {
  const articulations = FACTORY_DRUM_KIT.flatMap((element) => element.articulations);

  it('holds every key of the kit once, in kit order', () => {
    // Arrange
    const keys = [...new Set(articulations.map((articulation) => articulation.inputMidi))];

    // Assert
    expect(DRUM_KIT_NOTATIONS.map((notation) => notation.key)).toEqual(keys);
  });

  it('reads every notehead the kit names', () => {
    // Arrange
    const named = new Set(articulations.flatMap((articulation) => articulation.noteheads.split(' ')));

    // Assert
    expect([...named].filter((name) => !(DRUM_NOTEHEADS as readonly string[]).includes(name))).toEqual([]);
  });

  it('places each articulation where its staff line says', () => {
    const misplaced = DRUM_KIT_NOTATIONS.filter((notation) => {
      const element = FACTORY_DRUM_KIT[notation.elementIndex];
      const articulation = element?.articulations[notation.articulationIndex];
      return articulation === undefined || notation.position !== 8 - articulation.staffLine || articulation.name !== notation.articulationName;
    });

    expect(misplaced).toEqual([]);
  });
});
