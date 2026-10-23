import { GM_DRUM_KEYS, gmPercussionName } from '@gp-editor/core';
import { DRUM_KIT, DRUM_PIECES, drumKitHeight, drumKitLayout, engraveDrumKit, hitTestDrumKit } from '../src/score/drum-kit';
import { PALETTE, allFinite, texts } from '../test-support/score-helpers';

const WIDTH = 900;

/** The centre of a piece on a kit `width` points wide. */
function centreOf(id: string, width = WIDTH): { readonly x: number; readonly y: number } {
  const piece = DRUM_PIECES.find((candidate) => candidate.id === id)!;
  const { scale, left } = drumKitLayout(width);
  return { x: left + piece.x * scale, y: piece.y * scale };
}

describe('DRUM_PIECES', () => {
  it('has the pieces of a full kit, each entering a General MIDI drum', () => {
    // Act
    const ids = DRUM_PIECES.map((piece) => piece.id);

    // Assert
    expect(ids).toEqual(expect.arrayContaining(['kick', 'snare', 'sideStick', 'hiHat', 'openHiHat', 'pedalHiHat', 'tom1', 'tom2', 'tom3', 'floorTom', 'crash', 'crash2', 'ride', 'rideBell', 'china', 'splash', 'cowbell']));
    expect(DRUM_PIECES.every((piece) => gmPercussionName(piece.key) !== undefined && piece.keys.includes(piece.key))).toBe(true);
    expect(new Set(DRUM_PIECES.flatMap((piece) => piece.keys)).size).toBe(DRUM_PIECES.flatMap((piece) => piece.keys).length);
  });
});

describe('engraveDrumKit', () => {
  it('draws every piece with its label, nothing lit', () => {
    // Act
    const commands = engraveDrumKit({ width: WIDTH, keys: [], palette: PALETTE });

    // Assert
    const labels = texts(commands).map((text) => text.text);
    expect(labels).toEqual(expect.arrayContaining(['Kick', 'Snare', 'Hi-hat', 'Ride', 'Crash', 'China', 'Splash', 'Cowbell']));
    expect(commands.some((command) => command.kind !== 'text' && command.color === PALETTE.accent)).toBe(false);
    expect(allFinite(commands)).toBe(true);
  });

  it('lights the pieces whose drums sound: the kick for either bass drum, the hi-hat for its closed key', () => {
    // Act
    const commands = engraveDrumKit({ width: WIDTH, keys: [GM_DRUM_KEYS.acousticBassDrum, GM_DRUM_KEYS.closedHiHat], palette: PALETTE });

    // Assert
    const lit = texts(commands).filter((text) => text.color === PALETTE.accentText).map((text) => text.text);
    expect(lit.sort()).toEqual(['Hi-hat', 'Kick']);
  });

  it('names the sounding drums the kit does not show', () => {
    const commands = engraveDrumKit({ width: WIDTH, keys: [60, 70, GM_DRUM_KEYS.snare], palette: PALETTE });
    expect(texts(commands).map((text) => text.text)).toContain('Also: Hi Bongo, Maracas');
  });

  it('shrinks the kit to a narrow panel and centres it in a wide one', () => {
    expect(drumKitLayout(DRUM_KIT.width / 2)).toEqual({ scale: 0.5, left: 0 });
    expect(drumKitLayout(DRUM_KIT.width + 200)).toEqual({ scale: 1, left: 100 });
    expect(drumKitHeight(DRUM_KIT.width / 2)).toBe(DRUM_KIT.height / 2);
    expect(engraveDrumKit({ width: 0, keys: [], palette: PALETTE })).toEqual([]);
  });
});

describe('hitTestDrumKit', () => {
  it('finds the piece under the pointer and the drum it enters', () => {
    expect(hitTestDrumKit(WIDTH, centreOf('kick').x, centreOf('kick').y)?.key).toBe(GM_DRUM_KEYS.bassDrum);
    expect(hitTestDrumKit(WIDTH, centreOf('snare').x, centreOf('snare').y)?.key).toBe(GM_DRUM_KEYS.snare);
    expect(hitTestDrumKit(WIDTH, centreOf('pedalHiHat').x, centreOf('pedalHiHat').y)?.key).toBe(GM_DRUM_KEYS.pedalHiHat);
  });

  it('prefers the smaller piece on top: the ride bell over the ride', () => {
    expect(hitTestDrumKit(WIDTH, centreOf('rideBell').x, centreOf('rideBell').y)?.id).toBe('rideBell');
  });

  it('finds the same pieces on a shrunk kit, and nothing between pieces', () => {
    const narrow = DRUM_KIT.width * 0.6;
    expect(hitTestDrumKit(narrow, centreOf('floorTom', narrow).x, centreOf('floorTom', narrow).y)?.id).toBe('floorTom');
    expect(hitTestDrumKit(WIDTH, 1, 1)).toBeUndefined();
  });
});
