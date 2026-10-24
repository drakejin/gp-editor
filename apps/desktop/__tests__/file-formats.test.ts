import { DEFAULT_MASTER, buildAudioTrack, buildEffect, readSong, setMasterMix, setNoteFret, setTrackEffects, writeSong } from '@gp-editor/core';
import { ASCII_TAB_FILE, MIDI_FILE, SAVE_FORMATS, defaultSaveFormat, fileNameIn, saveFormatOf, saveHint } from '../src/lib/file-formats';
import { makeSong, beat, note } from '../test-support/songs';

describe('SAVE_FORMATS', () => {
  it('offers GP5, GP7/8, GP4 and GP3, GP5 first, each with its label and extension', () => {
    // Act
    const rows = SAVE_FORMATS.map(({ id, label, extension }) => [id, label, extension]);

    // Assert
    expect(rows).toEqual([
      ['gp5', 'Guitar Pro 5 (.gp5)', 'gp5'],
      ['gp', 'Guitar Pro 7/8 (.gp)', 'gp'],
      ['gp4', 'Guitar Pro 4 (.gp4)', 'gp4'],
      ['gp3', 'Guitar Pro 3 (.gp3)', 'gp3'],
    ]);
  });

  it('says what GP7/8, GP4 and GP3 cannot hold, and nothing for GP5', () => {
    // Act
    const notes = SAVE_FORMATS.map((format) => format.note);

    // Assert
    expect(notes[0]).toBeUndefined();
    expect(notes[1]).toMatch(/^Guitar Pro 7\/8 keeps what the editor edits and the audio track.*RSE.*not kept/);
    expect(notes[2]).toMatch(/^Guitar Pro 4 keeps one voice per bar/);
    expect(notes[3]).toMatch(/^Guitar Pro 3 keeps one voice per bar.*no lyrics/);
  });

  it('names formats gp-core writes, the bytes reading back as that format', () => {
    // Arrange
    const song = makeSong([[beat(960, [note(1, 3)])]]);

    // Act
    const formats = SAVE_FORMATS.map((format) => readSong(writeSong(song, format.id)).source.format);

    // Assert
    expect(formats).toEqual(['gp5', 'gp7', 'gp4', 'gp3']);
  });
});

describe('MIDI_FILE and ASCII_TAB_FILE', () => {
  it('tell the save panel what the export holds', () => {
    expect([MIDI_FILE.extension, ASCII_TAB_FILE.extension]).toEqual(['mid', 'txt']);
    expect(MIDI_FILE.note).toMatch(/repeats unfolded.*muted tracks are left out/);
    expect(ASCII_TAB_FILE.note).toMatch(/drum tracks are left out/);
  });
});

describe('saveFormatOf (plain Save keeps a file in its own format)', () => {
  it('finds the format of a file the app writes, whatever the case of its extension', () => {
    expect(saveFormatOf('/a/Song.gp5')?.id).toBe('gp5');
    expect(saveFormatOf('/a/Song.GP4')?.id).toBe('gp4');
    expect(saveFormatOf('/a/my.song.gp3')?.id).toBe('gp3');
    expect(saveFormatOf('/a/Song.gp')?.id).toBe('gp');
  });

  it('finds none for a format the app only reads, a new sheet or a name without an extension', () => {
    expect(saveFormatOf('/a/Song.gpx')).toBeUndefined();
    expect(saveFormatOf('/a/Song.gtp')).toBeUndefined();
    expect(saveFormatOf('')).toBeUndefined();
    expect(saveFormatOf('/a/gp5')).toBeUndefined();
  });
});

describe('defaultSaveFormat', () => {
  it('preselects the file’s own format when the app writes it, else GP5', () => {
    expect(defaultSaveFormat('/a/Song.gp3').id).toBe('gp3');
    expect(defaultSaveFormat('/a/Song.gp').id).toBe('gp');
    expect(defaultSaveFormat('/a/Song.gpx').id).toBe('gp5');
    expect(defaultSaveFormat('').id).toBe('gp5');
  });
});

describe('fileNameIn', () => {
  it('gives the file the format’s extension', () => {
    expect(fileNameIn('Song.gpx', SAVE_FORMATS[0])).toBe('Song.gp5');
    expect(fileNameIn('my.song.gp', MIDI_FILE)).toBe('my.song.mid');
    expect(fileNameIn('Untitled', ASCII_TAB_FILE)).toBe('Untitled.txt');
  });
});

describe('saveHint', () => {
  const song = makeSong([[beat(960, [note(1, 0)])]]);
  const format = (id: string) => SAVE_FORMATS.find((candidate) => candidate.id === id)!;

  it('is the format’s note, and says where effects go when the format cannot keep them', () => {
    // Arrange
    const withEffects = setTrackEffects(song, 0, [buildEffect('drive')]);
    const withMaster = setMasterMix(song, { ...DEFAULT_MASTER, gainDb: -3 });

    // Act / Assert
    expect(saveHint(format('gp5'), song)).toBeUndefined();
    expect(saveHint(format('gp'), withEffects)).toBe(format('gp').note);
    expect(saveHint(format('gp5'), withEffects)).toBe('Guitar Pro 5 keeps no playback effects: save as Guitar Pro 7/8 (.gp) to keep them.');
    expect(saveHint(format('gp4'), withMaster)).toBe(`${format('gp4').note} Guitar Pro 4 keeps no playback effects: save as Guitar Pro 7/8 (.gp) to keep them.`);
  });

  it('warns that GP5 leaves voices 3 and 4 out when the song plays them, GP4 and GP3 joining every voice into voice 1', () => {
    // Arrange: voice 3 plays in bar 1
    const inVoice3 = setNoteFret(song, { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 2, string: 3 }, 5);

    // Act / Assert
    expect(saveHint(format('gp5'), inVoice3)).toBe('Guitar Pro 5 keeps two voices: the notes of voices 3 and 4 are left out; save as Guitar Pro 7/8 (.gp) to keep them.');
    expect(saveHint(format('gp5'), song)).toBeUndefined();
    expect(saveHint(format('gp'), inVoice3)).toBe(format('gp').note);
    expect(saveHint(format('gp4'), inVoice3)).toBe(format('gp4').note);
    expect(format('gp4').note).toContain('voices 2, 3 and 4 join voice 1');
    expect(format('gp3').note).toContain('voices 2, 3 and 4 join voice 1');
  });

  it('says that GP5, GP4 and GP3 leave the audio track out', () => {
    // Arrange
    const withAudio = { ...song, audioTrack: buildAudioTrack({ assetId: 'take' }) };

    // Act / Assert
    expect(saveHint(format('gp5'), withAudio)).toBe('Guitar Pro 5 keeps no audio track: save as Guitar Pro 7/8 (.gp) to keep it.');
    expect(saveHint(format('gp3'), withAudio)).toContain('Guitar Pro 3 keeps no audio track');
    expect(saveHint(format('gp'), withAudio)).toBe(format('gp').note);
  });

  it('says that GP5, GP4 and GP3 keep one clef per track when the clef changes', () => {
    // Arrange
    const twoBars = makeSong([[beat(960, [note(1, 0)])], [beat(4800, [note(1, 0)])]]);
    const track = twoBars.tracks[0]!;
    const changed = { ...twoBars, tracks: [{ ...track, measures: track.measures.map((measure, index) => ({ ...measure, clef: index === 1 ? ('bass' as const) : measure.clef })) }] };

    // Act / Assert
    expect(saveHint(format('gp5'), changed)).toBe('Guitar Pro 5 keeps one clef per track (from its tuning): save as Guitar Pro 7/8 (.gp) to keep the clef changes.');
    expect(saveHint(format('gp4'), changed)).toContain('Guitar Pro 4 keeps one clef per track');
    expect(saveHint(format('gp'), changed)).toBe(format('gp').note);
    expect(saveHint(format('gp5'), twoBars)).toBeUndefined();
  });
});
