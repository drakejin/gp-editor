// How the Songsterr panel writes a found song and its tracks: the most viewed parts first, each as "instrument · name ·
// tuning" — the instrument named as the app names General MIDI programs, the tuning in note names for fretted
// instruments only (Songsterr gives vocals and horns a guitar's tuning too).
import { t } from '../lib/i18n/i18n';
import { gmProgramName } from '../lib/instruments';
import { tuningLabel } from '../lib/pitch';
import type { SongsterrSong, SongsterrTrack } from './songsterr-answer';

/** Tracks listed under a song; the others are counted. */
export const SHOWN_TRACKS = 6;
/** Songsterr's instrument id of a drum track (beyond General MIDI's programs). */
const SONGSTERR_DRUMS = 1024;
const LAST_GM_PROGRAM = 127;
/** General MIDI programs with frets: guitars and basses (24–39), sitar, banjo, shamisen and koto (104–107). */
const FRETTED_PROGRAMS: readonly (readonly [number, number])[] = [
  [24, 39],
  [104, 107],
];

export interface ShownTracks {
  readonly tracks: readonly SongsterrTrack[];
  /** Tracks of the song not listed. */
  readonly hiddenCount: number;
}

/** The song's most viewed tracks first (Songsterr's order between equals), at most SHOWN_TRACKS. */
export function shownTracks(song: SongsterrSong): ShownTracks {
  const byViews = song.tracks.map((track, index) => ({ track, index })).sort((a, b) => b.track.views - a.track.views || a.index - b.index);
  return {
    tracks: byViews.slice(0, SHOWN_TRACKS).map(({ track }) => track),
    hiddenCount: Math.max(0, song.tracks.length - SHOWN_TRACKS),
  };
}

function instrumentName(track: SongsterrTrack): string {
  const { instrumentId } = track;
  if (instrumentId === SONGSTERR_DRUMS) {
    return t('instruments.drums');
  }
  if (instrumentId !== undefined && instrumentId <= LAST_GM_PROGRAM) {
    return gmProgramName(instrumentId);
  }
  return track.instrument === '' ? t('tools.songsterr.unknownInstrument') : track.instrument;
}

function isFretted(instrumentId: number | undefined): boolean {
  return instrumentId !== undefined && FRETTED_PROGRAMS.some(([first, last]) => instrumentId >= first && instrumentId <= last);
}

/** "Distortion Electric Guitar · Kirk Hammett | Lead Guitar · E A D G B E": the parts the track has. */
export function trackSummary(track: SongsterrTrack): string {
  const tuning = track.tuning !== undefined && isFretted(track.instrumentId) ? tuningLabel(track.tuning) : '';
  return [instrumentName(track), track.name, tuning].filter((part) => part !== '').join(' · ');
}

/** "One — Metallica" (the title alone without an artist). */
export function songLabel(song: SongsterrSong): string {
  return song.artist === '' ? song.title : `${song.title} — ${song.artist}`;
}
