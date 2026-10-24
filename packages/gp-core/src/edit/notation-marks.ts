// Notation marks (no TuxGuitar counterpart: TuxGuitar has no fingering, slash notation, shown accidentals or
// beaming): a note's fingers and shown accidental, a beat's slash and beam to the next beat, a track's slash notation
// and a bar's beam grouping. Each is one undoable edit; the same song comes back when nothing changes.
import { FINGERS } from '../formats/common/fingering';
import { beamGroupBounds, normalizeBeamGrouping, parseBeamGrouping } from '../model/beaming';
import { measureTicks } from '../model/defaults';
import type { AccidentalDisplay, BeamGrouping, BeamLink, Finger, MeasureHeader, Note, Song, Voice } from '../model/song';
import type { BeatAddress, StringAddress } from './addresses';
import { runEnd } from './measure-headers';
import { updateNote, updateTrack, updateVoice } from './song-paths';

/** Which hand a finger plays with: left frets (on a keyboard: the piano fingering), right picks. */
export type Hand = 'left' | 'right';

export const BEAM_LINKS: readonly BeamLink[] = ['break', 'join', 'breakSecondary'];
export const ACCIDENTAL_DISPLAYS: readonly AccidentalDisplay[] = ['cautionary', 'forced'];

/** `item` with `key` set to `value`, or without it for undefined (the model leaves unset marks out). */
function withOptional<T extends object, K extends keyof T>(item: T, key: K, value: T[K] | undefined): T {
  if (item[key] === value) {
    return item;
  }
  if (value !== undefined) {
    return { ...item, [key]: value };
  }
  const { [key]: _removed, ...rest } = item;
  return rest as T;
}

/** New song with a finger of one hand on the addressed note (undefined takes it off). Same song for an unknown finger. */
export function setNoteFinger(song: Song, at: StringAddress, hand: Hand, finger: Finger | undefined): Song {
  const key = hand === 'left' ? 'leftFinger' : hand === 'right' ? 'rightFinger' : undefined;
  if (key === undefined || (finger !== undefined && !FINGERS.includes(finger))) {
    return song;
  }
  return updateNote(song, at, (note) => withOptional<Note, typeof key>(note, key, finger));
}

/** New song with the note's accidental shown in parentheses (cautionary) or always (forced); undefined: as usual. */
export function setNoteAccidentalDisplay(song: Song, at: StringAddress, display: AccidentalDisplay | undefined): Song {
  if (display !== undefined && !ACCIDENTAL_DISPLAYS.includes(display)) {
    return song;
  }
  return updateNote(song, at, (note) => withOptional(note, 'accidentalDisplay', display));
}

/** Changes a voice that holds a beat (notes or a rest); an empty voice stays as it is. */
function updatePlayedVoice(song: Song, at: BeatAddress, change: (voice: Voice) => Voice): Song {
  return updateVoice(song, at, (voice) => (voice.isEmpty ? voice : change(voice)));
}

/** New song with the beat written as a rhythm slash, or as notes again. */
export function setVoiceSlashed(song: Song, at: BeatAddress, isSlashed: boolean): Song {
  return updatePlayedVoice(song, at, (voice) => withOptional(voice, 'isSlashed', isSlashed ? true : undefined));
}

/** New song with the beam from the beat to the voice's next beat broken, joined or with only the primary beam; undefined: by the bar's grouping. */
export function setVoiceBeamToNext(song: Song, at: BeatAddress, link: BeamLink | undefined): Song {
  if (link !== undefined && !BEAM_LINKS.includes(link)) {
    return song;
  }
  return updatePlayedVoice(song, at, (voice) => withOptional(voice, 'beamToNext', link));
}

/** New song with the whole track written in rhythm slashes, or as notes again. */
export function setTrackSlashNotation(song: Song, trackIndex: number, hasSlashNotation: boolean): Song {
  return updateTrack(song, trackIndex, (track) => withOptional(track, 'hasSlashNotation', hasSlashNotation ? true : undefined));
}

/** A grouping that fills a bar of the header's time signature exactly. */
function fitsBar(grouping: BeamGrouping, header: MeasureHeader): boolean {
  const { numerator, denominator } = header.timeSignature;
  return beamGroupBounds(grouping).at(-1) === measureTicks(numerator, denominator);
}

function isSameStored(a: BeamGrouping | undefined, b: BeamGrouping | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.unit === b.unit && a.groups.length === b.groups.length && a.groups.every((size, i) => size === b.groups[i]));
}

/**
 * New song with the bar's beam grouping (undefined: the time signature's own), and that of the following bars in the
 * same time signature grouped as the bar was (Guitar Pro 5 keeps a grouping until the next time signature). Same song
 * for groups that do not fill the bar exactly.
 */
export function setBeamGrouping(song: Song, measureIndex: number, grouping: BeamGrouping | undefined): Song {
  const header = song.measureHeaders[measureIndex];
  const parsed = grouping === undefined ? undefined : parseBeamGrouping(grouping.unit, grouping.groups);
  if (header === undefined || (grouping !== undefined && (parsed === undefined || !fitsBar(parsed, header)))) {
    return song;
  }
  const next = normalizeBeamGrouping(parsed, header.timeSignature);
  if (isSameStored(header.beamGrouping, next)) {
    return song;
  }
  const isAlike = (other: MeasureHeader): boolean =>
    other.timeSignature.numerator === header.timeSignature.numerator &&
    other.timeSignature.denominator === header.timeSignature.denominator &&
    isSameStored(other.beamGrouping, header.beamGrouping);
  const end = runEnd(song.measureHeaders, measureIndex, isAlike);
  const measureHeaders = song.measureHeaders.map((other, index) => (index >= measureIndex && index < end ? withOptional(other, 'beamGrouping', next) : other));
  return { ...song, measureHeaders };
}
