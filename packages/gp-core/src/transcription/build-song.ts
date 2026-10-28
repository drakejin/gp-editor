import { TranscriptionError } from '../errors';
import { EMPTY_SONG_INFO, RED } from '../model/defaults';
import type { Song, SongInfo, Track } from '../model/song';
import { GP5_VERSION } from '../write/gp5-writer';
import { DEFAULT_TEMPO, type PlannedMeasure, buildMeasureHeaders } from './header-plan';
import { buildBeatNotes } from './beat-notes';
import { buildDrumBeatNotes } from './drum-notes';
import { type TrackPlan, buildChannels, resolveTrackPlans } from './track-plans';
import { resolveLyricsTrack, withLyrics } from './lyrics';
import { type TrackLayout, buildTrackMeasures } from './track-measures';
import { isFrettedInstrument } from './instruments';
import type { TranscribedMeasure, TranscribedSongInfo, TranscriptionPage } from './types';

export interface TranscriptionOptions {
  /** Title when no page names the song (e.g. the PDF's file name). */
  readonly title?: string;
}

export interface TranscribedSong {
  readonly song: Song;
  /** For the user: the pages' warnings ("Page 2: …") then what the build changed or left out ("Bar 12: …"). */
  readonly warnings: readonly string[];
}

/** The first non-empty value of a song field across the pages. */
function firstSongField(pages: readonly TranscriptionPage[], field: 'title' | 'artist'): string | undefined {
  return pages.map((page) => page.song?.[field]?.trim()).find((value) => value !== undefined && value !== '');
}

function resolveSongInfo(pages: readonly TranscriptionPage[], options: TranscriptionOptions): SongInfo {
  const title = firstSongField(pages, 'title') ?? options.title?.trim() ?? '';
  return { ...EMPTY_SONG_INFO, title, artist: firstSongField(pages, 'artist') ?? '' };
}

/** The song tempo of the first page that marks one; DEFAULT_TEMPO else. */
function resolveTempo(pages: readonly TranscriptionPage[]): number {
  const tempo = pages.map((page): TranscribedSongInfo['tempo'] => page.song?.tempo).find((value) => value !== undefined && value > 0);
  return tempo ?? DEFAULT_TEMPO;
}

function pageWarnings(pages: readonly TranscriptionPage[]): readonly string[] {
  return pages.flatMap((page, pageIndex) => (page.warnings ?? []).map((warning) => `Page ${pageIndex + 1}: ${warning}`));
}

/** Parts for a track the song does not have (a later page naming a track index no page lists) are left out. */
function unknownPartWarnings(measures: readonly TranscribedMeasure[], trackCount: number): readonly string[] {
  return measures.flatMap((measure, index) =>
    measure.parts.filter((part) => part.track >= trackCount).map((part) => `Bar ${index + 1}: a part for track ${part.track + 1} left out (no such track)`),
  );
}

interface TrackBuild {
  readonly track: Track;
  readonly warnings: readonly string[];
}

/** How a track's measures are built: drums by the drum map, other notes on its strings as tab or by their pitch. */
function trackLayout(plan: TrackPlan, trackIndex: number, trackCount: number): TrackLayout {
  const neck = { tuning: plan.tuning, capo: plan.capo, lastFret: plan.lastFret, writtenAbove: plan.writtenAbove, readsTab: isFrettedInstrument(plan.instrument) };
  return {
    trackIndex,
    placeBeat: plan.isPercussion ? buildDrumBeatNotes : (voices) => buildBeatNotes(voices, neck),
    isPercussion: plan.isPercussion,
    clef: plan.clef,
    where: (barNumber) => (trackCount > 1 ? `Bar ${barNumber}, ${plan.name}` : `Bar ${barNumber}`),
  };
}

function buildTrack(plan: TrackPlan, trackIndex: number, trackCount: number, measures: readonly PlannedMeasure[]): TrackBuild {
  const { measures: built, warnings } = buildTrackMeasures(measures, trackLayout(plan, trackIndex, trackCount));
  const track: Track = {
    number: trackIndex + 1,
    name: plan.name,
    channelId: trackIndex + 1,
    strings: plan.tuning.map((tuning, index) => ({ number: index + 1, tuning })),
    color: RED,
    offset: plan.capo,
    isPercussion: plan.isPercussion,
    solo: false,
    mute: false,
    measures: built,
  };
  return { track, warnings };
}

/**
 * Builds a song from the transcribed pages of one score, in page order: the tracks the pages list (guitars, basses,
 * ukuleles and banjos with their tuning and capo, drums on the percussion bank, voices, keyboards and other instruments
 * on their General MIDI program and clef), every page's measures one after another (time signature, tempo and key held
 * until they change), each track's parts as its voices with notes placed on its strings (a drum's fret = its General
 * MIDI key). The song is a GP5 song, ready to be saved. Throws a TranscriptionError when no page has a measure.
 */
export function buildSongFromTranscription(pages: readonly TranscriptionPage[], options: TranscriptionOptions = {}): TranscribedSong {
  const measures = pages.flatMap((page) => page.measures);
  if (measures.length === 0) {
    throw new TranscriptionError('No measures were transcribed');
  }
  const { plans, warnings: trackWarnings } = resolveTrackPlans(pages, measures);
  const headers = buildMeasureHeaders(measures, resolveTempo(pages));
  const tracks = plans.map((plan, trackIndex) => buildTrack(plan, trackIndex, plans.length, headers.measures));
  const sung = withLyrics(
    tracks.map((built) => built.track),
    measures,
    resolveLyricsTrack(pages, plans.map((plan) => plan.instrument)),
  );
  const song: Song = {
    source: { format: 'gp5', version: GP5_VERSION },
    info: resolveSongInfo(pages, options),
    channels: buildChannels(plans),
    measureHeaders: headers.measureHeaders,
    tracks: sung.tracks,
  };
  return {
    song,
    warnings: [
      ...pageWarnings(pages),
      ...trackWarnings,
      ...unknownPartWarnings(measures, plans.length),
      ...tracks.flatMap((built) => built.warnings),
      ...sung.warnings,
    ],
  };
}
