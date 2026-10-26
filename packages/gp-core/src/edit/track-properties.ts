// Track properties after TuxGuitar's TGTrackManager.changeInfo / changeOffset (LGPL-2.1); the short name and the icon
// are Guitar Pro 7/8's (no TuxGuitar counterpart).
import { instrumentSetOf } from '../formats/common/instrument-sets';
import { TRACK_ICON_IDS, isTrackIconId } from '../formats/common/track-icons';
import type { Channel, Rgb, Song, Track } from '../model/song';
import { updateTrack } from './song-paths';

/** Highest capo fret (TGTrack.MAX_OFFSET). */
export const MAX_CAPO = 24;

const CHANNEL_MAX = 255;
/** A word longer than this is cut to `ABBREVIATED_LENGTH` letters and a dot in the abbreviated name. */
const LONG_WORD = 5;
const ABBREVIATED_LENGTH = 4;
/** A track named like a voice gets the voice icon whatever it plays (a vocal line on a piano sound). */
const VOICE_NAME = /voc|vox|voice|sing|choir/i;

/** The track's name with each word longer than five letters cut to four and a dot: "Distortion Guitar" → "Dist. Guit.". */
export function abbreviateTrackName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => (word.length > LONG_WORD ? `${word.slice(0, ABBREVIATED_LENGTH)}.` : word))
    .join(' ');
}

/** The short name a track is shown with: its own, else its name abbreviated. */
export function trackShortName(track: Pick<Track, 'name' | 'shortName'>): string {
  return track.shortName ?? abbreviateTrackName(track.name);
}

/**
 * A short name as a track keeps it: trimmed; none when it says nothing the name does not — blank, the name itself
 * (what GP Editor up to 0.15 wrote in place of one) or the name abbreviated.
 */
export function normalizeShortName(text: string | undefined, name: string): string | undefined {
  const next = typeof text === 'string' ? text.trim() : '';
  return next === '' || next === name.trim() || next === abbreviateTrackName(name) ? undefined : next;
}

/** The track with this short name, or without one (no `shortName` key) when it says nothing more. */
function withShortName(track: Track, text: string | undefined): Track {
  const shortName = normalizeShortName(text, track.name);
  if (shortName === track.shortName) {
    return track;
  }
  if (shortName !== undefined) {
    return { ...track, shortName };
  }
  const { shortName: _dropped, ...rest } = track;
  return rest;
}

/**
 * New song with the track renamed (trimmed); a short name the new name makes redundant goes. Same song for the same
 * name, a blank one or a missing track.
 */
export function setTrackName(song: Song, trackIndex: number, name: string): Song {
  const next = typeof name === 'string' ? name.trim() : '';
  if (next === '') {
    return song;
  }
  return updateTrack(song, trackIndex, (track) => (track.name === next ? track : withShortName({ ...track, name: next }, track.shortName)));
}

/**
 * New song with the track's short name (trimmed); a blank one, the name or the name abbreviated removes it. Same song
 * when nothing changes or the track is missing.
 */
export function setTrackShortName(song: Song, trackIndex: number, shortName: string): Song {
  return updateTrack(song, trackIndex, (track) => withShortName(track, shortName));
}

function toChannelValue(value: number): number {
  return Math.min(CHANNEL_MAX, Math.max(0, Math.round(value)));
}

/**
 * New song with the track in `color` (each channel rounded into 0…255). Same song for the same colour, a channel that
 * is not a number or a missing track.
 */
export function setTrackColor(song: Song, trackIndex: number, color: Rgb): Song {
  if (![color.r, color.g, color.b].every(Number.isFinite)) {
    return song;
  }
  const next: Rgb = { r: toChannelValue(color.r), g: toChannelValue(color.g), b: toChannelValue(color.b) };
  return updateTrack(song, trackIndex, (track) =>
    track.color.r === next.r && track.color.g === next.g && track.color.b === next.b ? track : { ...track, color: next },
  );
}

/**
 * The icon Guitar Pro gives a track's instrument (its instrument set's, `instrument-sets.ts`): the drum kit for a
 * percussion track, a voice for a track named like one, a steel guitar without a channel.
 */
export function instrumentIconId(track: Pick<Track, 'name' | 'isPercussion'>, channel: Pick<Channel, 'program' | 'isPercussion'> | undefined): number {
  if (track.isPercussion || channel?.isPercussion === true) {
    return TRACK_ICON_IDS.drums;
  }
  if (VOICE_NAME.test(track.name)) {
    return TRACK_ICON_IDS.voice;
  }
  return channel === undefined ? TRACK_ICON_IDS.steelGuitar : instrumentSetOf(channel.program, false).iconId;
}

function iconOfInstrument(song: Song, track: Track): number {
  return instrumentIconId(track, song.channels.find((channel) => channel.id === track.channelId));
}

/** The icon a track shows: its own, else its instrument's; undefined for a track the song does not have. */
export function trackIconId(song: Song, trackIndex: number): number | undefined {
  const track = song.tracks[trackIndex];
  return track === undefined ? undefined : (track.iconId ?? iconOfInstrument(song, track));
}

/** An icon id read from a file, as a track keeps it: none when it is not an icon id or is the instrument's own. */
export function normalizeIconId(iconId: number | undefined, instrumentIcon: number): number | undefined {
  return isTrackIconId(iconId) && iconId !== instrumentIcon ? iconId : undefined;
}

/**
 * New song with the track showing icon `iconId` (`TRACK_ICON_IDS`), whatever its instrument; undefined — or the
 * instrument's own icon — makes it follow its instrument again. Same song when nothing changes, for an id that is not
 * one (`isTrackIconId`) or a missing track.
 */
export function setTrackIcon(song: Song, trackIndex: number, iconId: number | undefined): Song {
  if (iconId !== undefined && !isTrackIconId(iconId)) {
    return song;
  }
  return updateTrack(song, trackIndex, (track) => {
    const next = iconId === undefined ? undefined : normalizeIconId(iconId, iconOfInstrument(song, track));
    if (next === track.iconId) {
      return track;
    }
    if (next !== undefined) {
      return { ...track, iconId: next };
    }
    const { iconId: _dropped, ...rest } = track;
    return rest;
  });
}

/**
 * New song with a capo on fret `capo` of the track (0 = none; rounded, 0…MAX_CAPO). The frets stay as written, so
 * the track sounds `capo` semitones higher, as in Guitar Pro. Same song when nothing changes, the capo is not a number,
 * or the track is missing or a percussion track (drums have no capo).
 */
export function setTrackCapo(song: Song, trackIndex: number, capo: number): Song {
  if (!Number.isFinite(capo)) {
    return song;
  }
  const next = Math.min(MAX_CAPO, Math.max(0, Math.round(capo)));
  return updateTrack(song, trackIndex, (track) => (track.offset === next || track.isPercussion ? track : { ...track, offset: next }));
}
