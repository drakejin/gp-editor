import { createChannelName } from '../formats/common/channels';
import type { Channel, Song } from '../model/song';
import { replaceAt, updateTrack } from './song-paths';

const MAX_PROGRAM = 127;

function isProgram(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_PROGRAM;
}

/**
 * New song where the track plays `program` (a General MIDI instrument). The track's channel changes; when another
 * track shares that channel, the track gets a copy of it instead, so the other track keeps its sound. Same song for
 * the same program, a program outside 0–127, a missing track or a percussion track: GP3–GP5 files hold no drum kit
 * (their readers reset percussion programs to 0, as TuxGuitar does), so a kit could not be saved.
 */
export function setTrackProgram(song: Song, trackIndex: number, program: number): Song {
  const track = song.tracks[trackIndex];
  const channelIndex = song.channels.findIndex((channel) => channel.id === track?.channelId);
  const channel = song.channels[channelIndex];
  if (track === undefined || channel === undefined || track.isPercussion || !isProgram(program) || channel.program === program) {
    return song;
  }
  const isShared = song.tracks.some((other, index) => index !== trackIndex && other.channelId === channel.id);
  if (!isShared) {
    return { ...song, channels: replaceAt(song.channels, channelIndex, { ...channel, program }) };
  }
  const own: Channel = {
    ...channel,
    id: Math.max(...song.channels.map((existing) => existing.id)) + 1,
    name: createChannelName(song.channels, program, channel.isPercussion),
    program,
  };
  return updateTrack({ ...song, channels: [...song.channels, own] }, trackIndex, (current) => ({ ...current, channelId: own.id }));
}
