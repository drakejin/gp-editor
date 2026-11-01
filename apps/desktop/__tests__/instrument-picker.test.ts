import { DEFAULT_CHANNEL, type Song, setTrackInstrument, planInstrumentChange } from '@gp-editor/core';
import {
  DRUMS_FAMILY_INDEX,
  PICKER_FAMILY_COUNT,
  canFamilyChangeStrings,
  choiceDetail,
  choiceLabel,
  familyChoices,
  familyLabel,
  familyOf,
  instrumentChangeHint,
  isKindChange,
  notesLostQuestion,
  trackChoice,
} from '../src/lib/instrument-picker';
import { beat, makeSong, note, onStrings, withTrack } from '../test-support/songs';

/** "Lead": a steel guitar playing E2 (string 6 open) and E4 (string 1 open). */
function guitar(): Song {
  const song = makeSong([[beat(960, [note(6, 0)]), beat(1920, [note(1, 0)])]]);
  return { ...onStrings(song, [64, 59, 55, 50, 45, 40], { program: 25 }), tracks: song.tracks.map((track) => ({ ...track, name: 'Lead' })) };
}

/** A drum track with two drum notes. */
function drums(): Song {
  const song = onStrings(makeSong([[beat(960, [note(1, 36), note(2, 42)])]]), [0, 0, 0, 0, 0, 0], { isPercussion: true, program: 0 });
  return { ...song, channels: [{ ...DEFAULT_CHANNEL, id: 1, program: 0, bank: 128, isPercussion: true }] };
}

describe('the picker’s families and instruments', () => {
  it('lists the 16 General MIDI families and then the drums, whose only instrument is the drum kit', () => {
    expect(PICKER_FAMILY_COUNT).toBe(17);
    expect(familyLabel(4)).toBe('Bass');
    expect(familyLabel(DRUMS_FAMILY_INDEX)).toBe('Drums');
    expect(familyChoices(4)).toEqual([32, 33, 34, 35, 36, 37, 38, 39]);
    expect(familyChoices(DRUMS_FAMILY_INDEX)).toEqual(['drums']);
    expect(choiceLabel('drums')).toBe('Drum Kit');
    expect(choiceLabel(33)).toBe('Fingered Electric Bass');
    expect([familyOf(33), familyOf('drums')]).toEqual([4, DRUMS_FAMILY_INDEX]);
  });

  it('reads what a track plays now: its program, or the drum kit', () => {
    expect(trackChoice(guitar(), 0)).toBe(25);
    expect(trackChoice(drums(), 0)).toBe('drums');
    expect(trackChoice(guitar(), 4)).toBeUndefined();
  });
});

/** "Lead" on a steel guitar: a B4 the bass's 24 frets cannot reach and a six-note E chord. */
function guitarWithChord(): Song {
  const chord = [note(1, 0), note(2, 0), note(3, 1), note(4, 2), note(5, 2), note(6, 0)];
  const song = makeSong([[beat(960, [note(1, 7)]), beat(1920, chord)]]);
  return { ...onStrings(song, [64, 59, 55, 50, 45, 40], { program: 25 }), tracks: song.tracks.map((track) => ({ ...track, name: 'Lead' })) };
}

describe('what an instrument does to the track, before it is picked', () => {
  it('previews what the new strings cannot keep, as picking it would: notes moved an octave and notes left out', () => {
    expect(choiceDetail(guitarWithChord(), 0, 33, true)).toBe('Bass · 4 strings · E A D G · 1 note moved an octave · 2 notes left out');
  });

  it('tells a change of what the track is (strings, tuning, clef, drums) from a change of its sound alone', () => {
    expect(isKindChange(guitar(), 0, 33, true)).toBe(true);
    expect(isKindChange(guitar(), 0, 33, false)).toBe(false);
    expect(isKindChange(guitar(), 0, 30, true)).toBe(false);
    expect(isKindChange(guitar(), 0, 56, true)).toBe(false);
    expect(isKindChange(guitar(), 0, 'drums', false)).toBe(true);
    expect(isKindChange(drums(), 0, 0, false)).toBe(true);
  });

  it('names the strings and tuning another kind gives the track, unless only the sound is to change', () => {
    expect(choiceDetail(guitar(), 0, 33, true)).toBe('Bass · 4 strings · E A D G');
    expect(choiceDetail(guitar(), 0, 33, false)).toBeUndefined();
    expect(choiceDetail(guitar(), 0, 30, true)).toBeUndefined();
    expect(choiceDetail(guitar(), 0, 0, true)).toBeUndefined();
  });

  it('counts the notes a change between drums and a pitched instrument takes out, whatever is chosen', () => {
    expect(choiceDetail(guitar(), 0, 'drums', false)).toBe('Drums · 2 notes out');
    expect(choiceDetail(drums(), 0, 33, false)).toBe('Bass · 4 strings · E A D G · 2 notes out');
  });

  it('offers to set the track only in a family whose instruments change a pitched track’s strings', () => {
    expect(canFamilyChangeStrings(guitar(), 0, 4)).toBe(true);
    expect(canFamilyChangeStrings(guitar(), 0, 3)).toBe(false);
    expect(canFamilyChangeStrings(guitar(), 0, DRUMS_FAMILY_INDEX)).toBe(false);
    expect(canFamilyChangeStrings(drums(), 0, 4)).toBe(false);
  });

  it('asks before taking notes out, and not when there are none', () => {
    expect(notesLostQuestion(guitar(), 0, 'drums')).toBe(
      'Drum Kit for “Lead”? Drums and pitched instruments cannot play each other’s notes: its 2 notes are taken out, the rhythm staying as rests. ⌘Z puts them back.',
    );
    expect(notesLostQuestion(guitar(), 0, 33)).toBeUndefined();
    const one = { ...guitar(), tracks: guitar().tracks.map((track) => ({ ...track, measures: [{ ...track.measures[0]!, beats: [beat(960, [note(1, 3)])] }] })) };
    expect(notesLostQuestion(one, 0, 'drums')).toBe(
      'Drum Kit for “Lead”? Drums and pitched instruments cannot play each other’s notes: its 1 note is taken out, the rhythm staying as rests. ⌘Z puts it back.',
    );
    const empty = { ...guitar(), tracks: guitar().tracks.map((track) => ({ ...track, measures: track.measures.map((measure) => ({ ...measure, beats: [] })) })) };
    expect(notesLostQuestion(empty, 0, 'drums')).toBeUndefined();
  });
});

describe('instrumentChangeHint', () => {
  it('says what the track became and what its new strings could not keep', () => {
    // Arrange: an E5 the bass’s 24 frets cannot reach.
    const song = guitar();
    const high = { ...song, tracks: [{ ...song.tracks[0]!, measures: [{ ...song.tracks[0]!.measures[0]!, beats: [beat(960, [note(1, 12)])] }] }] };
    const plan = planInstrumentChange(high, 0, 33)!;

    // Act
    const hint = instrumentChangeHint(high, 0, plan, setTrackInstrument(high, 0, 33));

    // Assert
    expect(hint).toBe('“Lead” is now a bass track: 4 strings, E A D G. Retuned: 1 note moved by an octave to fit the new tuning. ⌘Z restores the old tuning.');
  });

  it('says a drum track came of it and how many notes went', () => {
    const plan = planInstrumentChange(guitar(), 0, 'drums')!;
    expect(instrumentChangeHint(guitar(), 0, plan, setTrackInstrument(guitar(), 0, 'drums'))).toBe('“Lead” is now a drum track. 2 notes taken out: drums and pitched instruments cannot play each other’s notes.');
  });

  it('says what instrument a drum track now plays when it is no guitar, bass or keyboard', () => {
    const plan = planInstrumentChange(drums(), 0, 68)!;
    expect(instrumentChangeHint(drums(), 0, plan, setTrackInstrument(drums(), 0, 68))).toBe(
      '“Guitar” now plays as Oboe: 6 strings, E A D G B E. 2 notes taken out: drums and pitched instruments cannot play each other’s notes.',
    );
  });

  it('says nothing when only the sound changed, also on a channel another track shares (copied for this track)', () => {
    const song = guitar();
    const shared = withTrack(song, [[beat(960, [note(1, 3)])]], { channelId: song.tracks[0]!.channelId });
    const plan = planInstrumentChange(shared, 0, 33)!;
    expect(instrumentChangeHint(shared, 0, plan, setTrackInstrument(shared, 0, 33, { keepsTrack: true }))).toBeUndefined();
  });

  it('says nothing when only the sound changed', () => {
    const plan = planInstrumentChange(guitar(), 0, 30)!;
    expect(instrumentChangeHint(guitar(), 0, plan, setTrackInstrument(guitar(), 0, 30))).toBeUndefined();
  });
});
