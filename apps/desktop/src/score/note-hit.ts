import type { Song, Track } from '@gp-editor/core';
import { type RowGeometry, type ScoreMode, showsNotation, showsTab } from './geometry';
import { nearestBeat, tabString } from './hit-test';
import type { NoteHead } from './notation/chords';
import type { VoiceEvent } from './notation/events';
import { NOTATION } from './notation/metrics';
import { trackTransposition } from './notation/pitch';
import { placeMeasureChords } from './notation/voice-placement';
import type { PlacedMeasure } from './row';
import { FRET_BOX } from './symbols/small-frets';
import { isSlashedVoice } from './tab';

/** A note drawn on a row: its beat in the track, its voice and its string. */
export interface NoteHit {
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly voiceIndex: number;
  readonly string: number;
}

/** A row as the note under the pointer is looked for in it. */
export interface NoteHitRow {
  readonly song: Song;
  readonly trackIndex: number;
  /** The row's bars on its canvas (past the names column of a multitrack system). */
  readonly placed: readonly PlacedMeasure[];
  readonly geometry: RowGeometry;
  readonly mode: ScoreMode;
  /** Only this voice's notes (the voice being edited); every voice's when absent (multivoice, another track's staff). */
  readonly voiceIndex?: number;
}

/** How far beside a notehead (points) a press still takes it: a notehead is small. */
const NOTEHEAD_REACH = 2;

function isVoiceShown(row: NoteHitRow, voiceIndex: number): boolean {
  return row.voiceIndex === undefined || row.voiceIndex === voiceIndex;
}

/** The tab's note whose fret number (its box) is under (x, y): the nearest beat's, on the string under the pointer. */
function tabNoteAt(row: NoteHitRow, track: Track, bar: PlacedMeasure, x: number, y: number): NoteHit | undefined {
  if (!showsTab(row.mode)) {
    return undefined;
  }
  const string = tabString(row.geometry, track.strings.length, y);
  const beat = nearestBeat(bar.layout.beats, x - bar.x);
  if (string === undefined || beat === undefined || Math.abs(beat.x - (x - bar.x)) > FRET_BOX.width / 2) {
    return undefined;
  }
  const { measureIndex } = bar.layout;
  const voices = track.measures[measureIndex]?.beats[beat.beatIndex]?.voices ?? [];
  const voiceIndex = voices.findIndex((voice, index) => isVoiceShown(row, index) && !isSlashedVoice(track, voice) && voice.notes.some((note) => note.string === string));
  return voiceIndex < 0 ? undefined : { measureIndex, beatIndex: beat.beatIndex, voiceIndex, string };
}

/** A notehead with its beat and voice. */
interface EventHead {
  readonly head: NoteHead;
  readonly event: VoiceEvent;
}

function isUnderHead(head: NoteHead, x: number, y: number): boolean {
  return x >= head.x - NOTEHEAD_REACH && x <= head.x + head.width + NOTEHEAD_REACH && Math.abs(y - head.y) <= NOTATION.space / 2;
}

/** The notation's note whose notehead is under (x, y), placed as the engraving places it; the nearest of a cluster. */
function notationNoteAt(row: NoteHitRow, track: Track, bar: PlacedMeasure, x: number, y: number): NoteHit | undefined {
  const top = row.geometry.notationTop;
  const { measureIndex } = bar.layout;
  const header = row.song.measureHeaders[measureIndex];
  const measure = track.measures[measureIndex];
  if (top === undefined || !showsNotation(row.mode) || header === undefined || measure === undefined) {
    return undefined;
  }
  const transposition = trackTransposition(row.song, row.trackIndex);
  const { chords } = placeMeasureChords(track, measure, { layout: bar.layout, header, top, transposition });
  const localX = x - bar.x;
  const distance = (head: NoteHead) => Math.hypot(head.x + head.width / 2 - localX, head.y - y);
  const found = chords
    .flatMap((chord) => (chord === undefined || !isVoiceShown(row, chord.event.voiceIndex) ? [] : chord.heads.map((head): EventHead => ({ head, event: chord.event }))))
    .filter(({ head }) => head.note.isSlash !== true && isUnderHead(head, localX, y))
    .reduce<EventHead | undefined>((best, each) => (best === undefined || distance(each.head) < distance(best.head) ? each : best), undefined);
  return found === undefined ? undefined : { measureIndex, beatIndex: found.event.beatIndex, voiceIndex: found.event.voiceIndex, string: found.head.note.string };
}

/**
 * The note under a point of a row (layout points from the canvas's top left): a fret number on the tab, a notehead on
 * the notation staff, of the voice being edited (any voice when none is). None for a rhythm slash, which stands for a
 * whole beat, or anywhere else.
 */
export function hitTestNote(row: NoteHitRow, x: number, y: number): NoteHit | undefined {
  const track = row.song.tracks[row.trackIndex];
  const bar = row.placed.find((each) => x >= each.x && x < each.x + each.layout.width);
  if (track === undefined || bar === undefined) {
    return undefined;
  }
  return tabNoteAt(row, track, bar, x, y) ?? notationNoteAt(row, track, bar, x, y);
}
