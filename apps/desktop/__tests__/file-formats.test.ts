import { readSong, writeSong } from '@gp-editor/core';
import { ASCII_TAB_FILE, MIDI_FILE, SAVE_FORMATS, defaultSaveFormat, fileNameIn, saveFormatOf } from '../src/lib/file-formats';
import { makeSong, beat, note } from '../test-support/songs';

describe('SAVE_FORMATS', () => {
  it('offers GP5, GP4 and GP3, GP5 first, each with its label and extension', () => {
    // Act
    const rows = SAVE_FORMATS.map(({ id, label, extension }) => [id, label, extension]);

    // Assert
    expect(rows).toEqual([
      ['gp5', 'Guitar Pro 5 (.gp5)', 'gp5'],
      ['gp4', 'Guitar Pro 4 (.gp4)', 'gp4'],
      ['gp3', 'Guitar Pro 3 (.gp3)', 'gp3'],
    ]);
  });

  it('says what GP4 and GP3 cannot hold, and nothing for GP5', () => {
    // Act
    const notes = SAVE_FORMATS.map((format) => format.note);

    // Assert
    expect(notes[0]).toBeUndefined();
    expect(notes[1]).toMatch(/^Guitar Pro 4 keeps one voice per bar/);
    expect(notes[2]).toMatch(/^Guitar Pro 3 keeps one voice per bar.*no lyrics/);
  });

  it('names formats gp-core writes, the bytes reading back as that format', () => {
    // Arrange
    const song = makeSong([[beat(960, [note(1, 3)])]]);

    // Act
    const formats = SAVE_FORMATS.map((format) => readSong(writeSong(song, format.id)).source.format);

    // Assert
    expect(formats).toEqual(['gp5', 'gp4', 'gp3']);
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
  });

  it('finds none for a format the app only reads, a new sheet or a name without an extension', () => {
    expect(saveFormatOf('/a/Song.gpx')).toBeUndefined();
    expect(saveFormatOf('/a/Song.gp')).toBeUndefined();
    expect(saveFormatOf('/a/Song.gtp')).toBeUndefined();
    expect(saveFormatOf('')).toBeUndefined();
    expect(saveFormatOf('/a/gp5')).toBeUndefined();
  });
});

describe('defaultSaveFormat', () => {
  it('preselects the file’s own format when the app writes it, else GP5', () => {
    expect(defaultSaveFormat('/a/Song.gp3').id).toBe('gp3');
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
