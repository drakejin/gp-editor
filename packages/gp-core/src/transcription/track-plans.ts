import { MAX_FRET } from '../edit/edit-song';
import { neckFrets } from '../edit/string-placement';
import { createChannelName } from '../formats/common/channels';
import { writtenTransposition } from '../formats/common/instrument-sets';
import { DEFAULT_CHANNEL, DEFAULT_PERCUSSION_BANK } from '../model/defaults';
import type { Channel, Clef } from '../model/song';
import { isFrettedInstrument, resolveClef, resolveProgram } from './instruments';
import { DRUM_TUNING, type ResolvedTuning, partPitchRange, pitchedPartTuning, resolveFrettedTuning } from './track-tunings';
import type { TranscribedInstrument, TranscribedMeasure, TranscribedTrack, TranscriptionPage } from './types';
import { countOf } from './wording';

/** A track of the song to build, before its measures. */
export interface TrackPlan {
  readonly name: string;
  readonly instrument: TranscribedInstrument;
  /** A drum track: notes name drums, on the percussion bank. */
  readonly isPercussion: boolean;
  /** Open-string MIDI pitches, string 1 (highest) first. */
  readonly tuning: readonly number[];
  readonly capo: number;
  /** The last fret a note may take: the neck's for a fretted instrument, MAX_FRET on the import's own strings. */
  readonly lastFret: number;
  /** General MIDI program of its channel. */
  readonly program: number;
  readonly clef: Clef;
  /** Semitones the page's pitches for it are above its sound (pagePitchAbove, PAGE_PITCH_RULE). */
  readonly writtenAbove: number;
}

export interface TrackPlans {
  readonly plans: readonly TrackPlan[];
  readonly warnings: readonly string[];
}

/**
 * The strings a track's notes go on: a fretted instrument's tuning, a drum track's six silent strings, else strings that
 * hold the pitches its parts sound (pitchedPartTuning).
 */
function resolveTuning(track: TranscribedTrack, name: string, measures: readonly TranscribedMeasure[], trackIndex: number): ResolvedTuning {
  if (isFrettedInstrument(track.instrument)) {
    return resolveFrettedTuning(track, name);
  }
  return { tuning: track.instrument === 'drums' ? DRUM_TUNING : pitchedPartTuning(partPitchRange(measures, trackIndex)) };
}

/**
 * Semitones the page's pitches for a track are above its sound (PAGE_PITCH_RULE): a guitar's, bass's or banjo's written
 * pitches by its writtenTransposition (an octave; a ukulele's none), every other track's pitches are its sound.
 */
function pagePitchAbove(track: TranscribedTrack, program: number, tuning: readonly number[]): number {
  return isFrettedInstrument(track.instrument) ? writtenTransposition(program, false, tuning) : 0;
}

function toPlan(track: TranscribedTrack, trackIndex: number, measures: readonly TranscribedMeasure[]): { readonly plan: TrackPlan; readonly warning?: string } {
  const name = track.name.trim() === '' ? `Track ${trackIndex + 1}` : track.name;
  const isPercussion = track.instrument === 'drums';
  const program = resolveProgram(track, name);
  const { tuning, warning } = resolveTuning(track, name, measures, trackIndex);
  const isFretted = isFrettedInstrument(track.instrument);
  const capo = isFretted ? track.capo : 0;
  const plan: TrackPlan = {
    name,
    instrument: track.instrument,
    isPercussion,
    tuning,
    capo,
    lastFret: isFretted ? neckFrets(capo) : MAX_FRET,
    program,
    clef: resolveClef(track),
    writtenAbove: pagePitchAbove(track, program, tuning),
  };
  return warning === undefined ? { plan } : { plan, warning };
}

/** Tracks by index from the first page naming each: the first page with tracks gives them, later pages only add more. */
function mergeTracks(pages: readonly TranscriptionPage[]): readonly TranscribedTrack[] {
  return pages.reduce<readonly TranscribedTrack[]>((tracks, page) => [...tracks, ...(page.tracks ?? []).slice(tracks.length)], []);
}

/** As many tracks as the parts use (at least one). */
function partTrackCount(measures: readonly TranscribedMeasure[]): number {
  return measures.reduce((count, measure) => measure.parts.reduce((most, part) => Math.max(most, part.track + 1), count), 1);
}

/**
 * The song's tracks: those the pages list (see mergeTracks), each with its strings, capo, clef and General MIDI program.
 * When no page lists any, a standard-tuned guitar track for every track index the parts use, with a warning.
 */
export function resolveTrackPlans(pages: readonly TranscriptionPage[], measures: readonly TranscribedMeasure[]): TrackPlans {
  const listed = mergeTracks(pages);
  if (listed.length === 0) {
    const count = partTrackCount(measures);
    const unnamed: TranscribedTrack = { name: '', instrument: 'guitar', tuning: [], capo: 0 };
    const plans = Array.from({ length: count }, (_, trackIndex) => toPlan(unnamed, trackIndex, measures).plan);
    return { plans, warnings: [`No track list was read: ${countOf(count, 'guitar track')} in standard tuning assumed`] };
  }
  const resolved = listed.map((track, trackIndex) => toPlan(track, trackIndex, measures));
  return { plans: resolved.map((item) => item.plan), warnings: resolved.flatMap((item) => item.warning ?? []) };
}

/** One channel per track (id = track number), named from its program as the readers name channels; drums on the percussion bank. */
export function buildChannels(plans: readonly TrackPlan[]): readonly Channel[] {
  return plans.reduce<readonly Channel[]>((channels, plan, trackIndex) => {
    const channel: Channel = {
      ...DEFAULT_CHANNEL,
      id: trackIndex + 1,
      name: createChannelName(channels, plan.program, plan.isPercussion),
      program: plan.program,
      ...(plan.isPercussion ? { bank: DEFAULT_PERCUSSION_BANK, isPercussion: true } : {}),
    };
    return [...channels, channel];
  }, []);
}
