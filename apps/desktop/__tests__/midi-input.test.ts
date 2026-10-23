import {
  CHORD_WINDOW_MS,
  DEFAULT_MIDI_INPUT,
  addNoteOn,
  listenedSourceIds,
  parseMidiInputSettings,
  parseMidiNote,
  parseMidiSources,
  serializeMidiInputSettings,
  toPlayedNotes,
} from '../src/lib/midi-input';

const noteOn = (key: number, channel = 0, velocity = 100) => ({ isOn: true, channel, key, velocity });

describe('parseMidiNote', () => {
  it('reads a note message from the native side', () => {
    expect(parseMidiNote({ on: true, channel: 2, key: 60, velocity: 90 })).toEqual({ isOn: true, channel: 2, key: 60, velocity: 90 });
    expect(parseMidiNote({ on: false, channel: 0, key: 60, velocity: 0 })?.isOn).toBe(false);
  });

  it('refuses anything that is not a MIDI note: out of range, not whole, missing', () => {
    const bad = [
      undefined,
      null,
      'note',
      { on: true, channel: 16, key: 60, velocity: 90 },
      { on: true, channel: 0, key: 128, velocity: 90 },
      { on: true, channel: 0, key: 60.5, velocity: 90 },
      { on: true, channel: 0, key: 60, velocity: -1 },
      { on: 'yes', channel: 0, key: 60, velocity: 90 },
      { channel: 0, key: 60, velocity: 90 },
    ];
    expect(bad.map(parseMidiNote)).toEqual(bad.map(() => undefined));
  });
});

describe('parseMidiSources', () => {
  it('keeps the well-formed sources and drops the rest', () => {
    const sources = parseMidiSources([{ id: 7, name: 'Keystation' }, { id: 'x', name: 'Bad' }, { id: -3, name: 'IAC Bus 1' }, { id: 2 }, 5]);
    expect(sources).toEqual([
      { id: 7, name: 'Keystation' },
      { id: -3, name: 'IAC Bus 1' },
    ]);
    expect(parseMidiSources('nope')).toEqual([]);
  });
});

describe('MIDI input settings', () => {
  it('starts off, from every source, without MIDI guitar mode or velocity', () => {
    expect(DEFAULT_MIDI_INPUT).toEqual({ isEnabled: false, isGuitarMode: false, usesVelocity: false });
  });

  it('round-trips through the JSON kept in user defaults', () => {
    const settings = { isEnabled: true, sourceId: 42, isGuitarMode: true, usesVelocity: true };
    expect(parseMidiInputSettings(serializeMidiInputSettings(settings))).toEqual(settings);
  });

  it('falls back to the defaults for each field it cannot read', () => {
    expect(parseMidiInputSettings(null)).toEqual(DEFAULT_MIDI_INPUT);
    expect(parseMidiInputSettings('{not json')).toEqual(DEFAULT_MIDI_INPUT);
    expect(parseMidiInputSettings('[1]')).toEqual(DEFAULT_MIDI_INPUT);
    expect(parseMidiInputSettings('{"isEnabled": true, "sourceId": 1.5, "isGuitarMode": "yes"}')).toEqual({ ...DEFAULT_MIDI_INPUT, isEnabled: true });
  });
});

describe('listenedSourceIds', () => {
  const sources = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];

  it('listens to every source, or to the chosen one while it is there, and to none when off', () => {
    expect(listenedSourceIds({ ...DEFAULT_MIDI_INPUT, isEnabled: true }, sources)).toEqual([1, 2]);
    expect(listenedSourceIds({ ...DEFAULT_MIDI_INPUT, isEnabled: true, sourceId: 2 }, sources)).toEqual([2]);
    expect(listenedSourceIds({ ...DEFAULT_MIDI_INPUT, isEnabled: true, sourceId: 9 }, sources)).toEqual([]);
    expect(listenedSourceIds(DEFAULT_MIDI_INPUT, sources)).toEqual([]);
  });
});

describe('addNoteOn', () => {
  it('gathers the notes struck within the chord window into one chord', () => {
    // Act
    const first = addNoteOn(undefined, noteOn(60), 1000);
    const second = addNoteOn(first.pending, noteOn(64), 1000 + 20);
    const third = addNoteOn(second.pending, noteOn(67), 1000 + CHORD_WINDOW_MS);

    // Assert
    expect(first.ready).toBeUndefined();
    expect(third.ready).toBeUndefined();
    expect(third.pending.notes.map((note) => note.key)).toEqual([60, 64, 67]);
  });

  it('hands over the chord when a note comes after the window, and starts a new one with it', () => {
    const chord = addNoteOn(addNoteOn(undefined, noteOn(60), 0).pending, noteOn(64), 10);
    const next = addNoteOn(chord.pending, noteOn(72), CHORD_WINDOW_MS + 1);
    expect(next.ready?.map((note) => note.key)).toEqual([60, 64]);
    expect(next.pending).toEqual({ notes: [noteOn(72)], startedAt: CHORD_WINDOW_MS + 1 });
  });
});

describe('toPlayedNotes', () => {
  it('enters the pitches, with the velocity only when asked', () => {
    expect(toPlayedNotes([noteOn(60, 0, 80)], DEFAULT_MIDI_INPUT)).toEqual([{ pitch: 60 }]);
    expect(toPlayedNotes([noteOn(60, 0, 80)], { ...DEFAULT_MIDI_INPUT, usesVelocity: true })).toEqual([{ pitch: 60, velocity: 80 }]);
  });

  it('puts a MIDI guitar note on the string of its channel (channel 1 = string 1)', () => {
    expect(toPlayedNotes([noteOn(64, 0), noteOn(59, 1)], { ...DEFAULT_MIDI_INPUT, isGuitarMode: true })).toEqual([
      { pitch: 64, string: 1 },
      { pitch: 59, string: 2 },
    ]);
  });
});
