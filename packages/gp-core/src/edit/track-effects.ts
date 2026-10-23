// A track's effect chain and the song's master mix (the app's playback effects; not in TuxGuitar).
import { isDefaultMaster, isSameChain, isSameMaster } from '../effects/effect-chain';
import { parseEffectChain, parseMasterMix } from '../effects/effects-json';
import type { Effect, MasterMix, Song, Track } from '../model/song';
import { updateTrack } from './song-paths';

function withoutEffects(track: Track): Track {
  const { effects: _dropped, ...rest } = track;
  return rest;
}

/**
 * New song where the track's sound goes through `effects` in order, checked as a saved file's would be (clamped values,
 * at most MAX_TRACK_EFFECTS, no master-only effects). An empty chain removes the track's effects. Same song when nothing
 * changes or the track is missing.
 */
export function setTrackEffects(song: Song, trackIndex: number, effects: readonly Effect[]): Song {
  const chain = parseEffectChain(effects);
  return updateTrack(song, trackIndex, (track) => {
    if (isSameChain(track.effects ?? [], chain)) {
      return track;
    }
    return chain.length === 0 ? withoutEffects(track) : { ...track, effects: chain };
  });
}

/** New song with the master mix (checked); the default master is not kept. Same song when nothing changes. */
export function setMasterMix(song: Song, master: MasterMix): Song {
  const next = parseMasterMix(master);
  if (isDefaultMaster(next)) {
    if (song.master === undefined) {
      return song;
    }
    const { master: _dropped, ...rest } = song;
    return rest;
  }
  return song.master !== undefined && isSameMaster(song.master, next) ? song : { ...song, master: next };
}
