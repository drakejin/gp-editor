import { readSong } from '../../src/read-song';
import type { Beat, Note, Song, Track } from '../../src/model/song';
import { encodeMusicXml } from '../../src/write/musicxml/musicxml-archive';

/** Hand-written MusicXML for reader tests: a score-partwise document around parts and their measures. */

export interface PartSpec {
  readonly id?: string;
  readonly name?: string;
  /** Extra content of the score-part (score-instrument, midi-instrument). */
  readonly scorePart?: string;
  /** The `<measure>` elements, or the content of one measure. */
  readonly measures: readonly string[];
}

export function measureXml(content: string, number = 1, attributes = ''): string {
  return `<measure number="${number}"${attributes}>${content}</measure>`;
}

export function scoreXml(parts: readonly PartSpec[], header = ''): string {
  const ids = parts.map((part, index) => part.id ?? `P${index + 1}`);
  const partList = parts
    .map((part, index) => `<score-part id="${ids[index]}"><part-name>${part.name ?? ''}</part-name>${part.scorePart ?? ''}</score-part>`)
    .join('');
  const body = parts
    .map((part, index) => {
      const measures = part.measures.map((measure, measureIndex) => (measure.startsWith('<measure') ? measure : measureXml(measure, measureIndex + 1)));
      return `<part id="${ids[index]}">${measures.join('')}</part>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">${header}<part-list>${partList}</part-list>${body}</score-partwise>`;
}

/** One part with the given measure contents. */
export function onePart(...measures: readonly string[]): string {
  return scoreXml([{ name: 'Guitar', measures }]);
}

export function readXml(xml: string): Song {
  return readSong(encodeMusicXml(xml));
}

export const DIVISIONS_1 = '<attributes><divisions>1</divisions></attributes>';

/** `<note>` with a pitch such as "E4", "F#4", "Bb3" and the rest of its content. */
export function pitchedNote(pitch: string, content: string, noteAttributes = ''): string {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(pitch);
  if (match === null) {
    throw new Error(`bad pitch ${pitch}`);
  }
  const alter = match[2] === '#' ? '<alter>1</alter>' : match[2] === 'b' ? '<alter>-1</alter>' : '';
  return `<note${noteAttributes}><pitch><step>${match[1]}</step>${alter}<octave>${match[3]}</octave></pitch>${content}</note>`;
}

/** A quarter note (divisions 1) in voice 1. */
export function quarter(pitch: string, extra = '', noteAttributes = ''): string {
  return pitchedNote(pitch, `<duration>1</duration><voice>1</voice><type>quarter</type>${extra}`, noteAttributes);
}

/** A quarter note (divisions 1) on string / fret, in voice 1. */
export function tabQuarter(pitch: string, string: number, fret: number, notations = '', extra = ''): string {
  return quarter(pitch, `${extra}<notations><technical><string>${string}</string><fret>${fret}</fret></technical>${notations}</notations>`);
}

export function firstTrack(song: Song): Track {
  const track = song.tracks[0];
  if (track === undefined) {
    throw new Error('the song has no track');
  }
  return track;
}

export function beatsOf(song: Song, measureIndex = 0, trackIndex = 0): readonly Beat[] {
  return song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? [];
}

/** The notes of voice 1 of each beat. */
export function voiceNotes(song: Song, measureIndex = 0, voiceIndex = 0, trackIndex = 0): readonly (readonly Note[])[] {
  return beatsOf(song, measureIndex, trackIndex).map((beat) => beat.voices[voiceIndex]?.notes ?? []);
}

/** Sounding pitch of a note (open string + fret + capo). */
export function pitchOf(track: Track, note: Note): number {
  return (track.strings[note.string - 1]?.tuning ?? Number.NaN) + note.fret + track.offset;
}
