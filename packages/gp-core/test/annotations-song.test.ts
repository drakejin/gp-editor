import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_FILE_ANNOTATIONS, SONG_ANNOTATIONS_VERSION, readSongAnnotations, songAnnotationsToJson } from '../src/annotations/song-annotations';
import { MAX_ANNOTATION_LENGTH } from '../src/annotations/annotation-text';
import type { BeatAddress } from '../src/edit/addresses';
import { setBeatAnnotation, songAnnotations } from '../src/edit/annotations';
import { GP7_ANNOTATIONS_ENTRY } from '../src/formats/gpif/container-gp7';
import { decodeUtf8Lenient } from '../src/io/text';
import { QUARTER_TIME, type Annotation, type Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import { buildSong, deepFreeze, n, play, rest } from './helpers/edit-songs';

function at(measureIndex: number, beatIndex: number, trackIndex = 0): BeatAddress {
  return { trackIndex, measureIndex, beatIndex, voiceIndex: 0 };
}

const NOTE: Annotation = { text: 'Watch the bend\n여기서 숨 쉬기', placement: 'above' };
const BELOW: Annotation = { text: 'let it ring <loud> & "free"', placement: 'below' };

/** Two tracks of two 4/4 bars: quarters, and a half note with a half rest. */
function plain(): Song {
  const quarters = [play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3))];
  const halves = [play(2, n(2, 5)), rest(2)];
  return deepFreeze(buildSong({ tracks: [[[quarters], [quarters]], [[halves], [halves]]] }));
}

/** NOTE on bar 2 beat 3 of track 1, BELOW on the rest of bar 1 of track 2. */
function annotated(): Song {
  return deepFreeze(setBeatAnnotation(setBeatAnnotation(plain(), at(1, 2), NOTE), at(0, 1, 1), BELOW));
}

function places(song: Song): string[] {
  return songAnnotations(song).map(({ trackIndex, measureIndex, beatIndex, annotation }) => `${trackIndex}:${measureIndex}:${beatIndex} ${annotation.placement} ${annotation.text}`);
}

/** JSON of one entry list, as a file would hold it. */
function fileOf(annotations: readonly unknown[]): string {
  return JSON.stringify({ version: SONG_ANNOTATIONS_VERSION, annotations });
}

describe('songAnnotationsToJson / readSongAnnotations', () => {
  it('writes nothing for a song without annotations', () => {
    expect(songAnnotationsToJson(plain())).toBeUndefined();
  });

  it('writes each annotation with its track, bar and place in the bar, and reads them back onto their beats', () => {
    // Arrange
    const json = songAnnotationsToJson(annotated()) ?? '';

    // Act
    const read = readSongAnnotations(plain(), json);

    // Assert
    expect(JSON.parse(json)).toEqual({
      version: SONG_ANNOTATIONS_VERSION,
      annotations: [
        { trackIndex: 0, measureIndex: 1, offset: 2 * QUARTER_TIME, ...NOTE },
        { trackIndex: 1, measureIndex: 0, offset: 2 * QUARTER_TIME, ...BELOW },
      ],
    });
    expect(places(read)).toEqual(places(annotated()));
  });

  it('puts an annotation whose place starts no beat on the beat sounding there', () => {
    const json = fileOf([{ trackIndex: 1, measureIndex: 1, offset: QUARTER_TIME, text: 'in the half note', placement: 'above' }]);
    expect(places(readSongAnnotations(plain(), json))).toEqual(['1:1:0 above in the half note']);
  });

  it('skips entries for tracks, bars or places the song does not have, and values of the wrong kind', () => {
    // Arrange
    const json = fileOf([
      { trackIndex: 5, measureIndex: 0, offset: 0, text: 'no track', placement: 'above' },
      { trackIndex: 0, measureIndex: 9, offset: 0, text: 'no bar', placement: 'above' },
      { trackIndex: 0, measureIndex: 0, offset: -1, text: 'before the bar', placement: 'above' },
      { trackIndex: 0.5, measureIndex: 0, offset: 0, text: 'half a track', placement: 'above' },
      { trackIndex: 0, measureIndex: 0, offset: '0', text: 'a string offset', placement: 'above' },
      { trackIndex: 0, measureIndex: 0, offset: 0, text: 42, placement: 'above' },
      { trackIndex: 0, measureIndex: 0, offset: 0, text: '   ', placement: 'above' },
      'not an entry',
      null,
      { trackIndex: 0, measureIndex: 0, offset: 0, text: 'kept', placement: 'sideways' },
    ]);

    // Act
    const read = readSongAnnotations(plain(), json);

    // Assert
    expect(places(read)).toEqual(['0:0:0 above kept']);
  });

  it('cuts a long text and reads at most MAX_FILE_ANNOTATIONS entries; the first one for a beat wins', () => {
    // Arrange
    const many = Array.from({ length: MAX_FILE_ANNOTATIONS + 10 }, (_, i) => ({ trackIndex: 0, measureIndex: 0, offset: 0, text: `n${i}`, placement: 'above' }));
    const long = fileOf([{ trackIndex: 0, measureIndex: 1, offset: 0, text: 'y'.repeat(MAX_ANNOTATION_LENGTH * 3), placement: 'below' }]);

    // Act
    const crowded = readSongAnnotations(plain(), fileOf(many));
    const cut = readSongAnnotations(plain(), long);

    // Assert
    expect(places(crowded)).toEqual(['0:0:0 above n0']);
    expect(songAnnotations(cut)[0]?.annotation.text).toHaveLength(MAX_ANNOTATION_LENGTH);
  });

  it('leaves the song as it is for text that is not its JSON or of another version', () => {
    const song = plain();
    expect(readSongAnnotations(song, 'not json')).toBe(song);
    expect(readSongAnnotations(song, '[]')).toBe(song);
    expect(readSongAnnotations(song, JSON.stringify({ version: SONG_ANNOTATIONS_VERSION + 1, annotations: [] }))).toBe(song);
    expect(readSongAnnotations(song, JSON.stringify({ version: SONG_ANNOTATIONS_VERSION, annotations: 'x' }))).toBe(song);
    expect(readSongAnnotations(song, fileOf([]))).toBe(song);
  });

  it('does not read values from an object prototype', () => {
    const json = '{"version":1,"annotations":[{"__proto__":{"trackIndex":0,"measureIndex":0,"offset":0,"text":"evil","placement":"above"}}]}';
    expect(places(readSongAnnotations(plain(), json))).toEqual([]);
  });
});

describe('annotations in files', () => {
  it(`a .gp file keeps them, as our own entry ${GP7_ANNOTATIONS_ENTRY}`, () => {
    // Act
    const bytes = writeSong(annotated(), 'gp');
    const read = readSong(bytes);

    // Assert
    expect(places(read)).toEqual(places(annotated()));
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toContain(GP7_ANNOTATIONS_ENTRY);
    expect(JSON.parse(decodeUtf8Lenient(entries[GP7_ANNOTATIONS_ENTRY] ?? new Uint8Array()))).toMatchObject({ version: SONG_ANNOTATIONS_VERSION });
  });

  it('a .gp file of a song without them has no such entry', () => {
    const entries = unzipSync(writeSong(plain(), 'gp'));
    expect(Object.keys(entries)).not.toContain(GP7_ANNOTATIONS_ENTRY);
    expect(places(readSong(writeSong(plain(), 'gp')))).toEqual([]);
  });

  it.each(['gp5', 'gp4', 'gp3'] as const)('a %s file cannot hold them: they are left out, the music is not', (format) => {
    const read = readSong(writeSong(annotated(), format));
    expect(places(read)).toEqual([]);
    expect(read.tracks[0]?.measures[1]?.beats[2]?.voices[0]?.notes[0]?.fret).toBe(2);
  });

  it('MusicXML writes each as boxed words over or under the staff, its lines kept', () => {
    // Act
    const xml = writeMusicXml(annotated());

    // Assert
    expect(xml).toContain('<direction placement="above">');
    expect(xml).toContain('<words enclosure="rectangle" xml:space="preserve">Watch the bend\n여기서 숨 쉬기</words>');
    expect(xml).toContain('<words enclosure="rectangle" xml:space="preserve">let it ring &lt;loud&gt; &amp; &quot;free&quot;</words>');
    expect(xml.match(/enclosure="rectangle"/g)).toHaveLength(2);
  });
});
