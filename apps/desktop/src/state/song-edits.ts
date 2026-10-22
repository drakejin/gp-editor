import {
  BEND_PRESETS,
  type BeatAddress,
  type Bend,
  type Duration,
  NORMAL_TUPLET,
  NOTE_VALUES,
  type NoteValue,
  type Song,
  type StringAddress,
  type ToggleableEffect,
  type Voice,
  deleteBeat,
  deleteMeasure,
  findNote,
  insertBeat,
  insertMeasure,
  setBeatDuration,
  setKeySignature,
  setNoteBend,
  setNoteHarmonic,
  setNoteSlides,
  setNoteTied,
  setRepeat,
  setTempo,
  setTimeSignature,
  toNoteValue,
  toggleNoteEffect,
} from '@gp-editor/core';

/** Edits that act at the cursor; each returns the same song when it does not apply. */
export type SongEdit =
  | { readonly type: 'setNoteValue'; readonly value: NoteValue }
  | { readonly type: 'shiftNoteValue'; readonly step: -1 | 1 }
  | { readonly type: 'toggleDot' }
  | { readonly type: 'toggleTriplet' }
  | { readonly type: 'insertBeat' }
  | { readonly type: 'deleteBeat' }
  | { readonly type: 'toggleEffect'; readonly effect: ToggleableEffect }
  | { readonly type: 'toggleTie' }
  | { readonly type: 'toggleSlide' }
  | { readonly type: 'cycleBend' }
  | { readonly type: 'toggleHarmonic' }
  | { readonly type: 'insertMeasure' }
  | { readonly type: 'deleteMeasure' }
  | {
      readonly type: 'shiftTimeSignature';
      readonly part: 'numerator' | 'denominator';
      readonly delta: number;
    }
  | { readonly type: 'shiftTempo'; readonly delta: number }
  | { readonly type: 'shiftKeySignature'; readonly delta: number }
  | { readonly type: 'toggleRepeatOpen' }
  | { readonly type: 'toggleRepeatClose' };

const TRIPLET = { enters: 3, times: 2 } as const;
/** Repeat count a new repeat close gets (play twice). */
const DEFAULT_REPEAT_COUNT = 2;

export function beatAddress(cursor: StringAddress): BeatAddress {
  const { trackIndex, measureIndex, beatIndex, voiceIndex } = cursor;
  return { trackIndex, measureIndex, beatIndex, voiceIndex };
}

export function cursorVoice(
  song: Song,
  cursor: StringAddress,
): Voice | undefined {
  return song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex]?.beats[
    cursor.beatIndex
  ]?.voices[cursor.voiceIndex];
}

/** Applies one cursor edit to the song. */
export function applySongEdit(
  song: Song,
  cursor: StringAddress,
  edit: SongEdit,
): Song {
  switch (edit.type) {
    case 'setNoteValue':
    case 'shiftNoteValue':
    case 'toggleDot':
    case 'toggleTriplet':
      return editDuration(song, cursor, edit);
    case 'insertBeat':
      return insertBeat(song, beatAddress(cursor), 'after');
    case 'deleteBeat':
      return deleteBeat(song, beatAddress(cursor));
    case 'insertMeasure':
      return insertMeasure(song, cursor.measureIndex, 'after');
    case 'deleteMeasure':
      return deleteMeasure(song, cursor.measureIndex);
    case 'shiftTimeSignature':
    case 'shiftTempo':
    case 'shiftKeySignature':
    case 'toggleRepeatOpen':
    case 'toggleRepeatClose':
      return editMeasureHeader(song, cursor, edit);
    default:
      return editNote(song, cursor, edit);
  }
}

function editDuration(song: Song, cursor: StringAddress, edit: SongEdit): Song {
  const current = cursorVoice(song, cursor)?.duration;
  if (current === undefined) {
    return song;
  }
  const next = nextDuration(current, edit);
  return next === undefined
    ? song
    : setBeatDuration(song, beatAddress(cursor), next);
}

function nextDuration(current: Duration, edit: SongEdit): Duration | undefined {
  switch (edit.type) {
    case 'setNoteValue':
      return { ...current, value: edit.value };
    case 'shiftNoteValue': {
      const index = NOTE_VALUES.indexOf(current.value) + edit.step;
      const value = NOTE_VALUES[index];
      return value === undefined ? undefined : { ...current, value };
    }
    case 'toggleDot':
      return { ...current, dotted: !current.dotted, doubleDotted: false };
    case 'toggleTriplet':
      return {
        ...current,
        tuplet: isTriplet(current) ? NORMAL_TUPLET : TRIPLET,
      };
    default:
      return undefined;
  }
}

export function isTriplet(duration: Duration): boolean {
  return (
    duration.tuplet.enters === TRIPLET.enters &&
    duration.tuplet.times === TRIPLET.times
  );
}

function editNote(song: Song, cursor: StringAddress, edit: SongEdit): Song {
  const note = findNote(song, cursor);
  switch (edit.type) {
    case 'toggleEffect':
      return toggleNoteEffect(song, cursor, edit.effect);
    case 'toggleTie':
      return setNoteTied(song, cursor, !(note?.isTied ?? false));
    case 'toggleSlide':
      return setNoteSlides(
        song,
        cursor,
        (note?.effect.slides.length ?? 0) > 0 ? [] : ['shift'],
      );
    case 'cycleBend':
      return setNoteBend(
        song,
        cursor,
        nextBend(bendPeak(note?.effect.bend?.points ?? [])),
      );
    case 'toggleHarmonic':
      return setNoteHarmonic(
        song,
        cursor,
        note?.effect.harmonic === undefined
          ? { type: 'natural', data: 0 }
          : undefined,
      );
    default:
      return song;
  }
}

function bendPeak(points: readonly { readonly value: number }[]): number {
  return Math.max(0, ...points.map(point => point.value));
}

/** No bend → ½ → full → no bend. */
function nextBend(peak: number): Bend | undefined {
  const half = bendPeak(BEND_PRESETS.half.points);
  const full = bendPeak(BEND_PRESETS.full.points);
  if (peak === 0) {
    return BEND_PRESETS.half;
  }
  if (peak <= half) {
    return BEND_PRESETS.full;
  }
  return peak >= full ? undefined : BEND_PRESETS.full;
}

/** Bar settings of the cursor's bar; the key shifts from the key of the cursor's track. */
function editMeasureHeader(
  song: Song,
  cursor: StringAddress,
  edit: SongEdit,
): Song {
  const { measureIndex } = cursor;
  const header = song.measureHeaders[measureIndex];
  const measure = song.tracks[cursor.trackIndex]?.measures[measureIndex];
  if (header === undefined) {
    return song;
  }
  const { numerator, denominator } = header.timeSignature;
  switch (edit.type) {
    case 'shiftTimeSignature':
      return edit.part === 'numerator'
        ? setTimeSignature(song, measureIndex, {
            numerator: numerator + edit.delta,
            denominator,
          })
        : setTimeSignature(song, measureIndex, {
            numerator,
            denominator:
              NOTE_VALUES[
                NOTE_VALUES.indexOf(toNoteValue(denominator)) + edit.delta
              ] ?? denominator,
          });
    case 'shiftTempo':
      return setTempo(song, measureIndex, header.tempo + edit.delta);
    case 'shiftKeySignature':
      return setKeySignature(
        song,
        measureIndex,
        (measure?.keySignature ?? 0) + edit.delta,
      );
    case 'toggleRepeatOpen':
      return setRepeat(song, measureIndex, { repeatOpen: !header.repeatOpen });
    case 'toggleRepeatClose':
      return setRepeat(song, measureIndex, {
        repeatClose: header.repeatClose > 0 ? 0 : DEFAULT_REPEAT_COUNT,
      });
    default:
      return song;
  }
}
