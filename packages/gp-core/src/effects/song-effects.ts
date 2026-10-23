// A song's effects as JSON of our own (not in TuxGuitar), for a file format that can carry it next to the score: the
// .gp writer stores it as a zip entry (GP7_EFFECTS_ENTRY) that Guitar Pro ignores. GP3/GP4/GP5 cannot hold it.
import { setMasterMix, setTrackEffects } from '../edit/track-effects';
import type { Song } from '../model/song';
import { isDefaultMaster } from './effect-chain';
import { isJsonObject, ownValue, parseEffectChain, parseMasterMix } from './effects-json';

export const SONG_EFFECTS_VERSION = 1;

/** `{ version, master?, tracks: [{ trackIndex, effects }] }`, or undefined when the song has no effects to keep. */
export function songEffectsToJson(song: Song): string | undefined {
  const tracks = song.tracks.flatMap((track, trackIndex) => (track.effects === undefined || track.effects.length === 0 ? [] : [{ trackIndex, effects: track.effects }]));
  const master = song.master === undefined || isDefaultMaster(song.master) ? undefined : song.master;
  if (tracks.length === 0 && master === undefined) {
    return undefined;
  }
  return JSON.stringify({ version: SONG_EFFECTS_VERSION, ...(master === undefined ? {} : { master }), tracks });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Not our JSON: the file is read without effects, as one that never had them.
    return undefined;
  }
}

/**
 * The song with the effects `text` (songEffectsToJson's output) holds, checked like any untrusted input. Text of
 * another version, or that is not such JSON, leaves the song as it is; entries for tracks it does not have are skipped.
 */
export function readSongEffects(song: Song, text: string): Song {
  const raw = parseJson(text);
  if (!isJsonObject(raw) || ownValue(raw, 'version') !== SONG_EFFECTS_VERSION) {
    return song;
  }
  const tracks = ownValue(raw, 'tracks');
  const entries: readonly unknown[] = Array.isArray(tracks) ? tracks : [];
  const withTracks = entries.reduce<Song>((current, entry) => {
    const trackIndex = isJsonObject(entry) ? ownValue(entry, 'trackIndex') : undefined;
    if (!isJsonObject(entry) || typeof trackIndex !== 'number') {
      return current;
    }
    return setTrackEffects(current, trackIndex, parseEffectChain(ownValue(entry, 'effects')));
  }, song);
  const master = ownValue(raw, 'master');
  return master === undefined ? withTracks : setMasterMix(withTracks, parseMasterMix(master));
}
