import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readGp7Container } from '../src/formats/gpif/container-gp7';
import { type Beat, GpFormatError, type Note, type Song, readSong, vibratoOf } from '../src/index';
import { assertSongInvariants } from './helpers/invariants';
import { listFixtures, loadFixture } from './helpers/fixtures';
import { toTux } from './helpers/ticks';

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${index} (length ${items.length})`);
  }
  return item;
}

function beatAt(song: Song, measure: number, beat: number, track = 0): Beat {
  return at(at(at(song.tracks, track).measures, measure).beats, beat);
}

function noteAt(song: Song, measure: number, beat: number, note = 0): Note {
  return at(at(beatAt(song, measure, beat).voices, 0).notes, note);
}

function read(name: string): Song {
  return readSong(loadFixture('guitarpro7', name));
}

const MINIMAL_GPIF = '<GPIF><GPVersion>7</GPVersion><MasterBars><MasterBar><Time>4/4</Time><Bars>0</Bars></MasterBar></MasterBars>'
  + '<Tracks><Track id="0"><Name>T</Name></Track></Tracks><Bars><Bar id="0"><Voices>-1 -1 -1 -1</Voices></Bar></Bars></GPIF>';

describe('Guitar Pro 7 (.gp) fixture sweep', () => {
  const names = listFixtures('guitarpro7');

  it('has fixtures', () => {
    expect(names.length).toBe(52);
  });

  it.each(names)('%s parses and passes the song invariants', (name) => {
    // Act
    const song = read(name);

    // Assert
    expect(song.source.format).toBe('gp7');
    assertSongInvariants(song);
  });
});

describe('readGp7Container', () => {
  it('returns Content/score.gpif and the VERSION entry', () => {
    // Arrange
    const zip = zipSync({ VERSION: strToU8('7.0'), 'Content/score.gpif': strToU8('<GPIF/>') });

    // Act
    const container = readGp7Container(zip);

    // Assert
    expect(new TextDecoder().decode(container.score)).toBe('<GPIF/>');
    expect(container.version).toBe('7.0');
  });

  it('rejects a zip without Content/score.gpif', () => {
    const zip = zipSync({ VERSION: strToU8('7.0') });
    expect(() => readGp7Container(zip)).toThrow(/Content\/score\.gpif/);
  });

  it('rejects bytes that are not a valid zip archive', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => readGp7Container(bytes)).toThrow(GpFormatError);
    expect(() => readSong(bytes)).toThrow(GpFormatError);
  });

  it('reads a deflate-compressed archive', () => {
    expect(read('compressed.gp').measureHeaders.length).toBeGreaterThan(0);
  });
});

describe('Guitar Pro 7 (.gp) values', () => {
  it('serenade: keeps the icon a track was given apart from its instrument, and its short name', () => {
    // Act
    const song = read('serenade.gp');

    // Assert: "Keyboard" plays a music box (program 10, a mallets icon) under Guitar Pro 7's steel guitar icon
    expect(song.tracks.map((track) => [track.shortName, track.iconId])).toEqual([
      ['S-Gt', undefined],
      ['S-Gt', undefined],
      ['A-Bass', undefined],
      ['S-Gt', 1],
    ]);
  });

  it('reads no icon or short name from values that are not ones', () => {
    // Arrange
    const gpif = MINIMAL_GPIF.replace('<Name>T</Name>', '<Name>Long Name</Name><ShortName>  </ShortName><IconId>500</IconId>');

    // Act
    const track = at(readSong(zipSync({ 'Content/score.gpif': strToU8(gpif) })).tracks, 0);

    // Assert
    expect(track.shortName).toBeUndefined();
    expect(track.iconId).toBeUndefined();
  });

  it('reports GPVersion and GPRevision as the version', () => {
    expect(read('notes.gp').source).toEqual({ format: 'gp7', version: '7 r12020' });
  });

  it('falls back to the VERSION entry when the GPIF has no version', () => {
    // Arrange
    const gpif = MINIMAL_GPIF.replace('<GPVersion>7</GPVersion>', '');
    const zip = zipSync({ VERSION: strToU8('7.0'), 'Content/score.gpif': strToU8(gpif) });

    // Act
    const song = readSong(zip);

    // Assert
    expect(song.source.version).toBe('7.0');
    expect(at(at(song.tracks, 0).measures, 0).beats).toEqual([]);
  });

  it('rejects a score.gpif that is not GPIF XML', () => {
    const zip = zipSync({ 'Content/score.gpif': strToU8('<NotGpif/>') });
    expect(() => readSong(zip)).toThrow(/GPIF/);
  });

  it('bends: TuxGuitar points including the explicit origin offset', () => {
    const song = read('bends.gp');
    const points = (m: number, b: number) => noteAt(song, m, b).effect.bend?.points.map((p) => [p.position, p.value]);
    expect(points(0, 0)).toEqual([[0, 0], [0, 0], [6, 2], [6, 2], [12, 4]]);
    expect(points(0, 1)).toEqual([[0, 0], [0, 0], [6, 2], [6, 2], [12, 4]]);
    expect(points(1, 0)).toEqual([[0, 0], [0, 0], [6, 12], [6, 12], [12, 6]]);
  });

  it('bends-advanced: middle points at offset 12 are skipped, as TuxGuitar does', () => {
    const song = read('bends-advanced.gp');
    const points = (m: number, b: number) => noteAt(song, m, b).effect.bend?.points.map((p) => [p.position, p.value]);
    expect(points(0, 0)).toEqual([[0, 0], [0, 0], [3, 4], [12, 4]]);
    expect(points(0, 1)).toEqual([[0, 0], [0, 0], [2, 4], [4, 4], [6, 0], [12, 0]]);
    expect(points(2, 0)).toEqual([[0, 4], [0, 4], [6, 4], [6, 4], [12, 4]]);
    expect(points(9, 1)).toEqual([[0, 4], [0, 4], [3, 0], [12, 0]]);
  });

  it('tremolo: the GP7 <Whammy> element is read like the GP6 whammy properties', () => {
    const song = read('tremolo.gp');
    const points = (m: number) => noteAt(song, m, 0).effect.tremoloBar?.points.map((p) => [p.position, p.value]);
    expect(points(0)).toEqual([[0, 0], [0, 0], [6, -4], [12, 0]]);
    expect(points(1)).toEqual([[0, -4], [0, -4], [3, -2], [12, 0]]);
    expect(points(2)).toEqual([[0, 0], [0, 0], [6, -4], [12, -4]]);
    expect(points(3)).toEqual([[0, -4], [0, -4], [3, -12], [6, -12], [9, 0], [12, 0]]);
  });

  it('tremolo-vibrato: slight and wide vibrato on notes and whammy bar', () => {
    // Act
    const song = read('tremolo-vibrato.gp');

    // Assert
    const kinds = [noteAt(song, 0, 0), noteAt(song, 1, 0, 0), noteAt(song, 1, 0, 1), noteAt(song, 2, 0), noteAt(song, 3, 0)].map((note) =>
      vibratoOf(note.effect),
    );
    expect(kinds).toEqual(['slight', 'wide', 'slight', 'slight', 'wide']);
  });

  it('simile-mark: simile bars repeat the content of the previous bar(s)', () => {
    // Act
    const song = read('simile-mark.gp');

    // Assert
    const frets = (m: number) => at(song.tracks, 0).measures[m]?.beats.map((b) => b.voices[0]?.notes.map((n) => n.fret));
    expect(frets(1)).toEqual(frets(0));
    expect(frets(4)).toEqual(frets(2));
    expect(frets(5)).toEqual(frets(3));
    expect(frets(9)).toEqual(frets(6));
    expect(frets(4)).not.toEqual(frets(3));
  });

  it('anacrusis: the beats of an incomplete first bar are moved to its end', () => {
    // Act
    const song = read('anacrusis.gp');

    // Assert
    const first = at(at(song.tracks, 0).measures, 0);
    expect(first.beats.map((b) => toTux(b.start))).toEqual([960 + 1920, 960 + 2880]);
    expect(at(at(song.tracks, 0).measures, 1).beats.map((b) => toTux(b.start))).toEqual([4800, 5760, 6720, 7680]);
  });

  it('track-volume: channel volume from the RSE channel strip', () => {
    const song = read('track-volume.gp');
    const volumes = song.tracks.map((t) => song.channels.find((c) => c.id === t.channelId)?.volume);
    expect(volumes).toEqual([127, 114, 102, 84, 61, 30, 1]);
  });

  it('track-balance: channel balance from the RSE channel strip', () => {
    const song = read('track-balance.gp');
    const balances = song.tracks.map((t) => song.channels.find((c) => c.id === t.channelId)?.balance);
    expect(balances).toEqual([0, 32, 64, 95, 127]);
  });

  it('program-change: the first sound sets the channel program', () => {
    const song = read('program-change.gp');
    expect(at(song.channels, 0).program).toBe(25);
  });

  it('chord-no-diagram: a chord without diagram keeps its name', () => {
    const chord = beatAt(read('chord-no-diagram.gp'), 0, 0).chord;
    expect(chord).toEqual({ name: 'C', firstFret: 1, frets: [-1, -1, -1, -1, -1, -1] });
  });

  it('drum-tabs: percussion channel, zero tuning and MIDI pitches as frets', () => {
    // Act
    const song = read('drum-tabs.gp');

    // Assert
    const track = at(song.tracks, 0);
    expect(track.isPercussion).toBe(true);
    expect(at(song.channels, 0)).toMatchObject({ isPercussion: true, bank: 128, program: 0 });
    expect(track.strings.map((s) => s.tuning)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(at(at(track.measures, 0).beats, 0).voices[0]?.notes.map((n) => [n.fret, n.string])).toEqual([[29, 6]]);
    expect(at(track.measures, 0).beats).toHaveLength(16);
    expect(at(track.measures, 0).clef).toBe('neutral');
  });

  it('drum-custom-lines: note strings follow the GPIF string index', () => {
    const song = read('drum-custom-lines.gp');
    expect([0, 1, 2, 3].map((b) => [noteAt(song, 0, b).fret, noteAt(song, 0, b).string])).toEqual([
      [36, 2],
      [36, 3],
      [36, 4],
      [36, 5],
    ]);
  });

  it('pick-slide: pick slides are not slide types of the model and are dropped', () => {
    const song = read('pick-slide.gp');
    expect(noteAt(song, 0, 0).fret).toBe(10);
    expect(noteAt(song, 0, 0).effect.slides).toEqual([]);
  });
});
