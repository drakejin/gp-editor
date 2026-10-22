import { standardTuningFor } from '../edit/tuning-presets';
import { createChannelName } from '../formats/common/channels';
import { DEFAULT_CHANNEL } from '../model/defaults';
import type { Channel } from '../model/song';
import { MAX_STRINGS } from '../write/gtp-song';
import { parsePitch } from './pitch';
import type { TranscribedInstrument, TranscribedMeasure, TranscribedTrack, TranscriptionPage } from './types';
import { countOf } from './wording';

/** A track of the song to build, before its measures. */
export interface TrackPlan {
  readonly name: string;
  readonly instrument: TranscribedInstrument;
  /** Open-string MIDI pitches, string 1 (highest) first. */
  readonly tuning: readonly number[];
  readonly capo: number;
  /** General MIDI program of its channel. */
  readonly program: number;
}

export interface TrackPlans {
  readonly plans: readonly TrackPlan[];
  readonly warnings: readonly string[];
}

/** Steel-string acoustic guitar and fingered electric bass: what a plain "Guitar" or "Bass" plays. */
const DEFAULT_PROGRAMS: Readonly<Record<TranscribedInstrument, number>> = { guitar: 25, bass: 33 };

/** Words in a track name that choose its General MIDI program, the first match winning. */
const NAMED_PROGRAMS: Readonly<Record<TranscribedInstrument, readonly (readonly [word: string, program: number])[]>> = {
  guitar: [
    ['nylon', 24],
    ['classical', 24],
    ['jazz', 26],
    ['clean', 27],
    ['mute', 28],
    ['overdrive', 29],
    ['crunch', 29],
    ['distort', 30],
    ['electric', 27],
  ],
  bass: [
    ['acoustic', 32],
    ['upright', 32],
    ['fretless', 35],
    ['slap', 36],
    ['pick', 34],
    ['synth', 38],
  ],
};

/** The General MIDI program for a track: chosen by a word of its name ("Distortion Guitar" → 30), else the instrument's default. */
function resolveProgram(name: string, instrument: TranscribedInstrument): number {
  const lowerName = name.toLowerCase();
  return NAMED_PROGRAMS[instrument].find(([word]) => lowerName.includes(word))?.[1] ?? DEFAULT_PROGRAMS[instrument];
}

/**
 * Open-string pitches, string 1 first. The contract lists them lowest first; a list given highest first is read that
 * way too. Standard tuning when none is given, or (with a warning) when it cannot be read or has more strings than
 * Guitar Pro 5 holds.
 */
function resolveTuning(track: TranscribedTrack, name: string): { readonly tuning: readonly number[]; readonly warning?: string } {
  const standard = standardTuningFor(track.instrument);
  if (track.tuning.length === 0) {
    return { tuning: standard };
  }
  const pitches = track.tuning.flatMap((text) => parsePitch(text) ?? []);
  const first = pitches[0];
  const last = pitches[pitches.length - 1];
  if (pitches.length !== track.tuning.length || pitches.length > MAX_STRINGS || first === undefined || last === undefined) {
    return { tuning: standard, warning: `${name}: tuning ${track.tuning.join(' ')} could not be read; standard tuning used` };
  }
  return { tuning: first > last ? pitches : [...pitches].reverse() };
}

function toPlan(track: TranscribedTrack, trackIndex: number): { readonly plan: TrackPlan; readonly warning?: string } {
  const name = track.name.trim() === '' ? `Track ${trackIndex + 1}` : track.name;
  const { tuning, warning } = resolveTuning(track, name);
  const plan: TrackPlan = { name, instrument: track.instrument, tuning, capo: track.capo, program: resolveProgram(name, track.instrument) };
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
 * The song's tracks: those the pages list (see mergeTracks), each with its tuning, capo and General MIDI program. When
 * no page lists any, a standard-tuned guitar track for every track index the parts use, with a warning.
 */
export function resolveTrackPlans(pages: readonly TranscriptionPage[], measures: readonly TranscribedMeasure[]): TrackPlans {
  const listed = mergeTracks(pages);
  if (listed.length === 0) {
    const count = partTrackCount(measures);
    const unnamed: TranscribedTrack = { name: '', instrument: 'guitar', tuning: [], capo: 0 };
    const plans = Array.from({ length: count }, (_, trackIndex) => toPlan(unnamed, trackIndex).plan);
    return { plans, warnings: [`No track list was read: ${countOf(count, 'guitar track')} in standard tuning assumed`] };
  }
  const resolved = listed.map(toPlan);
  return { plans: resolved.map((item) => item.plan), warnings: resolved.flatMap((item) => item.warning ?? []) };
}

/** One channel per track (id = track number), named from its program as the readers name channels. */
export function buildChannels(plans: readonly TrackPlan[]): readonly Channel[] {
  return plans.reduce<readonly Channel[]>(
    (channels, plan, trackIndex) => [...channels, { ...DEFAULT_CHANNEL, id: trackIndex + 1, name: createChannelName(channels, plan.program, false), program: plan.program }],
    [],
  );
}
