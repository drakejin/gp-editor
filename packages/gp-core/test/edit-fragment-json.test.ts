import { describe, expect, it } from 'vitest';
import type { BeatFragment, BeatFragmentItem } from '../src/edit/beat-fragment';
import { MAX_FRAGMENT_ITEMS, parseBeatFragment, serializeBeatFragment } from '../src/edit/fragment-json';
import { MAX_CURVE_POINTS } from '../src/edit/fragment-values-json';
import { EMPTY_NOTE_EFFECT, NO_STROKE } from '../src/model/defaults';
import type { Note, NoteEffect } from '../src/model/song';
import { dur, n } from './helpers/edit-songs';

const RICH_EFFECT: NoteEffect = {
  ...EMPTY_NOTE_EFFECT,
  bend: { points: [{ position: 0, value: 0 }, { position: 6, value: 4 }, { position: 12, value: 4 }] },
  tremoloBar: { points: [{ position: 0, value: 0 }, { position: 12, value: -24 }] },
  harmonic: { type: 'tapped', data: 17 },
  grace: { fret: 3, duration: 2, velocity: 79, transition: 'hammer', onBeat: false, isDead: false },
  trill: { fret: 7, duration: dur(16) },
  tremoloPicking: { duration: dur(32) },
  slides: ['shift', 'intoFromBelow'],
  vibrato: true,
  palmMute: true,
  letRing: true,
  heavyAccentuatedNote: true,
};

/** Every on/off effect set, so a flag the parser forgets fails the round trip (but slight and wide vibrato are never set together). */
const ALL_FLAGS: NoteEffect = {
  ...(Object.fromEntries(Object.entries(EMPTY_NOTE_EFFECT).map(([key, value]) => [key, typeof value === 'boolean' ? true : value])) as unknown as NoteEffect),
  vibrato: false,
};

const FRAGMENT: BeatFragment = {
  isPercussion: false,
  items: [
    {
      duration: dur(4),
      notes: [{ ...n(1, 5), effect: RICH_EFFECT }, n(3, 7)],
      stroke: { direction: 'down', value: 16 },
      pickStroke: 'up',
      chord: { name: 'Dm7', firstFret: 5, frets: [5, 6, 5, 7, -1, -1] },
      text: 'intro',
    },
    { duration: dur(8, { tuplet: { enters: 3, times: 2 } }), notes: [{ ...n(1, 5), isTied: true }], stroke: NO_STROKE, pickStroke: 'none' },
    { duration: dur(2, { dotted: true }), notes: [], stroke: NO_STROKE, pickStroke: 'down' },
    { duration: dur(16), notes: [{ ...n(6, 0), velocity: 127, effect: ALL_FLAGS }], stroke: NO_STROKE, pickStroke: 'none' },
  ],
};

type Raw = Record<string, unknown>;

/** The serialized fragment as plain JSON values, to tamper with. */
function raw(): Raw {
  return JSON.parse(serializeBeatFragment(FRAGMENT)) as Raw;
}

function rawItem(value: Raw, index = 0): Raw {
  return (value.items as Raw[])[index] as Raw;
}

function rawNote(value: Raw, itemIndex = 0, noteIndex = 0): Raw {
  return (rawItem(value, itemIndex).notes as Raw[])[noteIndex] as Raw;
}

function rawEffect(value: Raw): Raw {
  return rawNote(value).effect as Raw;
}

/** parseBeatFragment of the serialized fragment after `tamper` changed it. */
function parseTampered(tamper: (value: Raw) => void): BeatFragment | undefined {
  const value = raw();
  tamper(value);
  return parseBeatFragment(value);
}

function item(notes: Note[]): BeatFragmentItem {
  return { duration: dur(4), notes, stroke: NO_STROKE, pickStroke: 'none' };
}

describe('serializeBeatFragment and parseBeatFragment', () => {
  it('read back what was written, effects and beat marks included', () => {
    // Arrange
    const json = serializeBeatFragment(FRAGMENT);

    // Act
    const parsed = parseBeatFragment(JSON.parse(json));

    // Assert
    expect(parsed).toEqual(FRAGMENT);
    expect(JSON.parse(json)).toMatchObject({ format: 'gp-editor.beats', version: 1 });
  });

  it('removes ties that do not start inside the fragment', () => {
    // Arrange
    const fragment: BeatFragment = {
      isPercussion: false,
      items: [item([{ ...n(1, 5), isTied: true }]), item([{ ...n(1, 5), isTied: true }, { ...n(2, 6), isTied: true }])],
    };

    // Act
    const parsed = parseBeatFragment(JSON.parse(serializeBeatFragment(fragment)));

    // Assert
    expect(parsed?.items.map((entry) => entry.notes.map((note) => note.isTied))).toEqual([[false], [true, false]]);
  });

  it('accepts MIDI keys as frets in drum beats only', () => {
    const drums = (fret: number) => parseBeatFragment(JSON.parse(serializeBeatFragment({ isPercussion: true, items: [item([n(1, fret)])] })));
    expect(drums(127)?.items[0]?.notes[0]?.fret).toBe(127);
    expect(drums(128)).toBeUndefined();
    expect(parseBeatFragment(JSON.parse(serializeBeatFragment({ isPercussion: false, items: [item([n(1, 36)])] })))).toBeUndefined();
  });

  it('keeps one vibrato, the wide one, when the clipboard says both', () => {
    // Arrange
    const value = raw();
    rawEffect(value).wideVibrato = true;

    // Act
    const effect = parseBeatFragment(value)?.items[0]?.notes[0]?.effect;

    // Assert
    expect(effect).toMatchObject({ vibrato: false, wideVibrato: true });
  });

  it('orders notes by string', () => {
    const parsed = parseBeatFragment(JSON.parse(serializeBeatFragment({ isPercussion: false, items: [item([n(4, 2), n(2, 3)])] })));
    expect(parsed?.items[0]?.notes.map((note) => note.string)).toEqual([2, 4]);
  });

  it.each([null, 'beats', 42, [], {}])('rejects %j', (value) => {
    expect(parseBeatFragment(value)).toBeUndefined();
  });

  it.each<[string, (value: Raw) => void]>([
    ['another format', (value) => (value.format = 'other.beats')],
    ['another version', (value) => (value.version = 2)],
    ['no drum flag', (value) => delete value.isPercussion],
    ['items that are no list', (value) => (value.items = { 0: rawItem(value) })],
    ['no items', (value) => (value.items = [])],
    ['too many items', (value) => (value.items = Array.from({ length: MAX_FRAGMENT_ITEMS + 1 }, () => rawItem(value, 2)))],
    ['an item that is no object', (value) => ((value.items as unknown[])[1] = 'rest')],
    ['a note value that does not exist', (value) => ((rawItem(value).duration as Raw).value = 3)],
    ['two kinds of dot', (value) => Object.assign(rawItem(value).duration as Raw, { dotted: true, doubleDotted: true })],
    ['a tuplet Guitar Pro has not', (value) => ((rawItem(value).duration as Raw).tuplet = { enters: 4, times: 3 })],
    ['a tuplet with the wrong time', (value) => ((rawItem(value).duration as Raw).tuplet = { enters: 3, times: 3 })],
    ['an inner tuplet without an outer one', (value) => ((rawItem(value).duration as Raw).innerTuplet = { enters: 3, times: 2 })],
    ['an inner tuplet Guitar Pro has not', (value) => ((rawItem(value, 1).duration as Raw).innerTuplet = { enters: 4, times: 3 })],
    ['string 0', (value) => (rawNote(value).string = 0)],
    ['string 8', (value) => (rawNote(value).string = 8)],
    ['a negative fret', (value) => (rawNote(value).fret = -1)],
    ['a fret past MAX_FRET', (value) => (rawNote(value).fret = 30)],
    ['a fractional fret', (value) => (rawNote(value).fret = 2.5)],
    ['a velocity past 127', (value) => (rawNote(value).velocity = 128)],
    ['a tie that is no flag', (value) => (rawNote(value).isTied = 'yes')],
    ['two notes on one string', (value) => (rawItem(value).notes = [rawNote(value), rawNote(value)])],
    ['more notes than strings', (value) => (rawItem(value).notes = Array.from({ length: 8 }, (_, i) => ({ ...rawNote(value), string: i + 1 })))],
    ['notes that are no list', (value) => (rawItem(value).notes = rawNote(value))],
    ['a missing effect flag', (value) => delete rawEffect(value).vibrato],
    ['an effect flag that is no flag', (value) => (rawEffect(value).palmMute = 1)],
    ['an unknown slide', (value) => (rawEffect(value).slides = ['spin'])],
    ['a slide twice', (value) => (rawEffect(value).slides = ['shift', 'shift'])],
    ['a bend point past position 12', (value) => ((rawEffect(value).bend as { points: Raw[] }).points[1] = { position: 13, value: 4 })],
    ['a bend past three tones', (value) => ((rawEffect(value).bend as { points: Raw[] }).points[1] = { position: 6, value: 13 })],
    ['a bend without points', (value) => (rawEffect(value).bend = { points: [] })],
    ['a curve with too many points', (value) => (rawEffect(value).tremoloBar = { points: Array.from({ length: MAX_CURVE_POINTS + 1 }, () => ({ position: 0, value: 0 })) })],
    ['a tremolo bar past an octave', (value) => (rawEffect(value).tremoloBar = { points: [{ position: 0, value: -25 }] })],
    ['an unknown harmonic', (value) => (rawEffect(value).harmonic = { type: 'magic', data: 0 })],
    ['negative harmonic data', (value) => (rawEffect(value).harmonic = { type: 'tapped', data: -1 })],
    ['a grace note of an unknown length', (value) => ((rawEffect(value).grace as Raw).duration = 4)],
    ['a grace note with an unknown transition', (value) => ((rawEffect(value).grace as Raw).transition = 'slap')],
    ['a trill off the neck', (value) => ((rawEffect(value).trill as Raw).fret = 30)],
    ['tremolo picking at no note value', (value) => (rawEffect(value).tremoloPicking = { duration: { value: 3 } })],
    ['an effect that is null', (value) => (rawEffect(value).grace = null)],
    ['a stroke of unknown direction', (value) => (rawItem(value).stroke = { direction: 'sideways', value: 16 })],
    ['a stroke at an unknown speed', (value) => (rawItem(value).stroke = { direction: 'up', value: 5 })],
    ['an unknown pick stroke', (value) => (rawItem(value).pickStroke = 'left')],
    ['a chord without a name', (value) => delete (rawItem(value).chord as Raw).name],
    ['a chord name that is too long', (value) => ((rawItem(value).chord as Raw).name = 'x'.repeat(257))],
    ['a chord fret that is no whole number', (value) => ((rawItem(value).chord as Raw).frets = [1.5])],
    ['a chord with too many strings', (value) => ((rawItem(value).chord as Raw).frets = Array.from({ length: 26 }, () => 0))],
    ['a chord first fret past the MIDI range', (value) => ((rawItem(value).chord as Raw).firstFret = 128)],
    ['a chord that is null', (value) => (rawItem(value).chord = null)],
    ['an empty text', (value) => (rawItem(value).text = '  ')],
    ['a text that is too long', (value) => (rawItem(value).text = 'x'.repeat(1025))],
    ['a text that is no text', (value) => (rawItem(value).text = 42)],
  ])('rejects %s', (_label, tamper) => {
    expect(parseTampered(tamper)).toBeUndefined();
  });

  it('reads back a tuplet inside a tuplet', () => {
    // Arrange
    const nested: BeatFragment = { isPercussion: false, items: [{ ...item([n(1, 5)]), duration: dur(16, { tuplet: { enters: 5, times: 4 }, innerTuplet: { enters: 3, times: 2 } }) }] };

    // Act
    const parsed = parseBeatFragment(JSON.parse(serializeBeatFragment(nested)));

    // Assert
    expect(parsed).toEqual(nested);
  });

  it('still reads a fragment copied by an earlier version (durations without an inner tuplet)', () => {
    // Arrange: as gp-editor 0.11 put it on the clipboard
    const earlier = '{"format":"gp-editor.beats","version":1,"isPercussion":false,"items":[{"duration":{"value":8,"dotted":false,"doubleDotted":false,"tuplet":{"enters":3,"times":2}},"notes":[],"stroke":{"direction":"none","value":0},"pickStroke":"none"}]}';

    // Act
    const parsed = parseBeatFragment(JSON.parse(earlier));

    // Assert
    expect(parsed?.items[0]?.duration).toEqual(dur(8, { tuplet: { enters: 3, times: 2 } }));
  });

  it('reads a stroke of no direction as no stroke, whatever speed it stored', () => {
    const parsed = parseTampered((value) => (rawItem(value).stroke = { direction: 'none', value: 16 }));
    expect(parsed?.items[0]?.stroke).toEqual(NO_STROKE);
  });
});

describe('parseBeatFragment: notation marks of a note', () => {
  it('reads back fingers and a shown accidental', () => {
    // Arrange
    const marked: Note = { ...n(2, 3), leftFinger: 'annular', rightFinger: 'thumb', accidentalDisplay: 'cautionary' };
    const fragment: BeatFragment = { isPercussion: false, items: [item([marked])] };

    // Act
    const parsed = parseBeatFragment(JSON.parse(serializeBeatFragment(fragment)));

    // Assert
    expect(parsed).toEqual(fragment);
  });

  it.each([
    ['leftFinger', 'pinky'],
    ['rightFinger', 3],
    ['accidentalDisplay', 'loud'],
  ])('refuses a note whose %s is %o', (key, value) => {
    // Act
    const parsed = parseTampered((raw) => (rawNote(raw)[key] = value));

    // Assert
    expect(parsed).toBeUndefined();
  });
});
