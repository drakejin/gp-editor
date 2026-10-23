import type { Transposition, TranspositionMode, TranspositionOptions, TranspositionScope } from '@gp-editor/core';
import { plural } from '../lib/wording';
import type { EditorState } from './editor';

/** What Tools ▸ Transpose… moves: the selected beats (in the cursor's voice), the shown track, or every track. */
export type TranspositionTarget = 'selection' | 'track' | 'song';

/** The Transpose panel's settings. */
export interface TranspositionDraft {
  readonly mode: TranspositionMode;
  /** Semitones (chromatic) or scale steps (diatonic); negative goes down. */
  readonly amount: number;
  readonly octaves: number;
  readonly target: TranspositionTarget;
  /** Chord names and diagrams only, the notes staying (Guitar Pro's chord transposition). */
  readonly isChordsOnly: boolean;
}

/** The panel's amount goes from −24 to 24 semitones or steps, and whole octaves from −4 to 4. */
export const MAX_TRANSPOSE_AMOUNT = 24;
export const MAX_TRANSPOSE_OCTAVES = 4;

const SEMITONES_PER_OCTAVE = 12;
const STEPS_PER_OCTAVE = 7;

/** Up two semitones, on the selection when there is one, else on the shown track. */
export function initialTranspositionDraft(hasSelection: boolean): TranspositionDraft {
  return { mode: 'chromatic', amount: 2, octaves: 0, target: hasSelection ? 'selection' : 'track', isChordsOnly: false };
}

function clamp(value: number, max: number): number {
  return Math.max(-max, Math.min(max, Math.round(value))) + 0;
}

/** The amount within ±MAX_TRANSPOSE_AMOUNT, a whole number. */
export function clampTransposeAmount(value: number): number {
  return clamp(value, MAX_TRANSPOSE_AMOUNT);
}

export function clampTransposeOctaves(value: number): number {
  return clamp(value, MAX_TRANSPOSE_OCTAVES);
}

/** A typed amount ("+3", "-2", " 5 "); `fallback` when the text is not a whole number. */
export function parseTransposeAmount(text: string, fallback: number): number {
  const trimmed = text.trim();
  return /^[+-]?\d+$/.test(trimmed) ? clampTransposeAmount(Number(trimmed)) : fallback;
}

type ScopeState = Pick<EditorState, 'cursor' | 'selectionAnchor' | 'trackIndex'>;

/** gp-core's scope for a target; undefined for the selection when nothing is selected. */
export function transpositionScope(state: ScopeState, target: TranspositionTarget): TranspositionScope | undefined {
  if (target === 'song') {
    return { kind: 'song' };
  }
  if (target === 'track') {
    return { kind: 'track', trackIndex: state.trackIndex };
  }
  const { cursor, selectionAnchor } = state;
  if (cursor === undefined || selectionAnchor === undefined) {
    return undefined;
  }
  const beat = ({ trackIndex, measureIndex, beatIndex, voiceIndex }: NonNullable<ScopeState['cursor']>) => ({ trackIndex, measureIndex, beatIndex, voiceIndex });
  return { kind: 'beats', from: beat(selectionAnchor), to: beat(cursor) };
}

export function toTranspositionOptions(draft: TranspositionDraft): TranspositionOptions {
  return { mode: draft.mode, amount: draft.amount, octaves: draft.octaves, isChordsOnly: draft.isChordsOnly };
}

/** "up 2 semitones", "down 1 octave", "up 3 scale steps"; "by nothing" for no amount. */
export function describeTransposition(options: TranspositionOptions): string {
  const isChromatic = options.mode === 'chromatic';
  const perOctave = isChromatic ? SEMITONES_PER_OCTAVE : STEPS_PER_OCTAVE;
  const total = options.amount + (options.octaves ?? 0) * perOctave;
  if (total === 0) {
    return 'by nothing';
  }
  const size = Math.abs(total);
  const amount = size % perOctave === 0 ? plural(size / perOctave, 'octave') : plural(size, isChromatic ? 'semitone' : 'scale step');
  return `${total > 0 ? 'up' : 'down'} ${amount}`;
}

/** What could not move, as sentences for the hint strip; '' when everything moved. */
function leftOutText(result: Transposition): string {
  const notes = result.unplaced === 0 ? '' : ` ${plural(result.unplaced, 'note')} did not fit on the neck at the new pitch and stayed as ${result.unplaced === 1 ? 'it was' : 'they were'}.`;
  const chords = result.unplacedChords === 0 ? '' : ` ${plural(result.unplacedChords, 'chord diagram')} did not fit on the neck and stayed as ${result.unplacedChords === 1 ? 'it was' : 'they were'}.`;
  return `${notes}${chords}`;
}

/** The hint strip after Tools ▸ Transpose…: what moved, by how much, and what could not move. */
export function transpositionHint(result: Transposition, options: TranspositionOptions): string {
  const how = describeTransposition(options);
  if (options.isChordsOnly === true) {
    const moved = result.chords === 0 ? 'No chord names or diagrams to move here.' : `Moved ${plural(result.chords, 'chord')} ${how}; the notes stayed.`;
    return `${moved}${leftOutText(result)}`;
  }
  if (result.moved === 0 && result.unplaced === 0) {
    return 'No notes to transpose here (drum tracks never move).';
  }
  const moved = result.moved === 0 ? 'No notes moved.' : `Transposed ${plural(result.moved, 'note')} ${how}.`;
  const chords = result.chords === 0 ? '' : ` ${plural(result.chords, 'chord')} moved with them.`;
  return `${moved}${chords}${leftOutText(result)}`;
}
