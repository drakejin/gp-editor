// A track's sound after TuxGuitar's TGUpdateChannelAction (a channel per track) and TGTrackManager.changeMute /
// changeSolo (LGPL-2.1).
import { createChannelName } from '../formats/common/channels';
import type { Channel, Song } from '../model/song';
import { replaceAt, updateTrack } from './song-paths';

/** Highest MIDI program, volume and balance. */
const MAX_MIDI_VALUE = 127;

/** A whole MIDI data value, 0…127 (a program, a pitch). */
export function isMidiValue(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_MIDI_VALUE;
}

/**
 * The song with the track's channel changed by `change`. When another track shares that channel, the track gets a copy
 * of it instead (a new id, named after its program), so the other track keeps its sound. Same song when the track or
 * its channel is missing, or `change` returns the channel it was given.
 */
function updateTrackChannel(song: Song, trackIndex: number, change: (channel: Channel) => Channel): Song {
  const track = song.tracks[trackIndex];
  const channelIndex = song.channels.findIndex((channel) => channel.id === track?.channelId);
  const channel = song.channels[channelIndex];
  const changed = channel === undefined ? undefined : change(channel);
  if (track === undefined || channel === undefined || changed === undefined || changed === channel) {
    return song;
  }
  const isShared = song.tracks.some((other, index) => index !== trackIndex && other.channelId === channel.id);
  if (!isShared) {
    return { ...song, channels: replaceAt(song.channels, channelIndex, changed) };
  }
  const own: Channel = {
    ...changed,
    id: Math.max(...song.channels.map((existing) => existing.id)) + 1,
    name: createChannelName(song.channels, changed.program, changed.isPercussion),
  };
  return updateTrack({ ...song, channels: [...song.channels, own] }, trackIndex, (current) => ({ ...current, channelId: own.id }));
}

/**
 * New song where the track plays `program` (a General MIDI instrument). The track's channel changes; when another
 * track shares that channel, the track gets a copy of it instead, so the other track keeps its sound. Same song for
 * the same program, a program outside 0–127, a missing track or a percussion track: GP3–GP5 files hold no drum kit
 * (their readers reset percussion programs to 0, as TuxGuitar does), so a kit could not be saved.
 */
export function setTrackProgram(song: Song, trackIndex: number, program: number): Song {
  const track = song.tracks[trackIndex];
  if (track === undefined || track.isPercussion || !isMidiValue(program)) {
    return song;
  }
  return updateTrackChannel(song, trackIndex, (channel) => (channel.program === program ? channel : { ...channel, program }));
}

/** New song with one mixer value (volume or balance) of the track's channel set, as setTrackProgram changes the program. */
function setChannelValue(song: Song, trackIndex: number, field: 'volume' | 'balance', value: number): Song {
  if (!Number.isFinite(value)) {
    return song;
  }
  const next = Math.min(MAX_MIDI_VALUE, Math.max(0, Math.round(value)));
  return updateTrackChannel(song, trackIndex, (channel) => (channel[field] === next ? channel : { ...channel, [field]: next }));
}

/**
 * New song with the volume (0…127, rounded) of the track's channel set; a channel another track shares is copied for
 * this track first (see setTrackProgram). Percussion tracks too. Same song when nothing changes or it is not a number.
 */
export function setTrackVolume(song: Song, trackIndex: number, volume: number): Song {
  return setChannelValue(song, trackIndex, 'volume', volume);
}

/** New song with the balance (pan, 0…127, 64 = centre) of the track's channel set, as setTrackVolume sets the volume. */
export function setTrackBalance(song: Song, trackIndex: number, balance: number): Song {
  return setChannelValue(song, trackIndex, 'balance', balance);
}

/** New song with the track muted or not; muting ends its solo. Same song when nothing changes or the track is missing. */
export function setTrackMute(song: Song, trackIndex: number, isMute: boolean): Song {
  return updateTrack(song, trackIndex, (track) => (track.mute === isMute ? track : { ...track, mute: isMute, solo: isMute ? false : track.solo }));
}

/** New song with the track playing solo or not; a solo track is not muted. Same song when nothing changes. */
export function setTrackSolo(song: Song, trackIndex: number, isSolo: boolean): Song {
  return updateTrack(song, trackIndex, (track) => (track.solo === isSolo ? track : { ...track, solo: isSolo, mute: isSolo ? false : track.mute }));
}
