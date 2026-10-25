import {
  type Effect,
  type Lyrics,
  type MasterMix,
  type Song,
  type SongInfo,
  setMasterMix,
  setSongInfo,
  setTrackBalance,
  setTrackCapo,
  setTrackEffects,
  setTrackLyrics,
  setTrackMute,
  setTrackName,
  setTrackProgram,
  setTrackSlashNotation,
  setTrackSolo,
  setTrackVolume,
} from '@gp-editor/core';
import { isOfTypes } from '../lib/type-guards';

/** Edits of one track or of the song itself, not at the cursor; each is one undo step. */
export type SongAction =
  /** The General MIDI instrument a track plays (saved with the song). */
  | { readonly type: 'setTrackProgram'; readonly trackIndex: number; readonly program: number }
  | { readonly type: 'setTrackName'; readonly trackIndex: number; readonly name: string }
  | { readonly type: 'setTrackMute'; readonly trackIndex: number; readonly isMute: boolean }
  | { readonly type: 'setTrackSolo'; readonly trackIndex: number; readonly isSolo: boolean }
  /** 0–127, on the track's channel (a channel shared with another track is copied first). */
  | { readonly type: 'setTrackVolume'; readonly trackIndex: number; readonly volume: number }
  /** Pan 0–127 (64 = centre), as the volume. */
  | { readonly type: 'setTrackBalance'; readonly trackIndex: number; readonly balance: number }
  /** Capo fret 0–24; the frets stay as written. */
  | { readonly type: 'setTrackCapo'; readonly trackIndex: number; readonly capo: number }
  /** The whole track written in rhythm slashes (the track inspector's Slash toggle). */
  | { readonly type: 'setTrackSlashNotation'; readonly trackIndex: number; readonly hasSlashNotation: boolean }
  /** The track's playback effects in order (saved in .gp files); an empty chain removes them. */
  | { readonly type: 'setTrackEffects'; readonly trackIndex: number; readonly effects: readonly Effect[] }
  /** The master strip on the whole mix. */
  | { readonly type: 'setMasterMix'; readonly master: MasterMix }
  /** The track's lyrics (Edit ▸ Lyrics…); a blank text takes them away. */
  | { readonly type: 'setTrackLyrics'; readonly trackIndex: number; readonly lyrics: Lyrics }
  | { readonly type: 'setSongInfo'; readonly info: Partial<SongInfo> };

export const isSongAction = isOfTypes<SongAction>({
  setTrackProgram: true, setTrackName: true, setTrackMute: true, setTrackSolo: true, setTrackVolume: true, setTrackBalance: true,
  setTrackCapo: true, setTrackSlashNotation: true, setTrackEffects: true, setMasterMix: true, setTrackLyrics: true, setSongInfo: true,
});

export function applySongAction(song: Song, action: SongAction): Song {
  switch (action.type) {
    case 'setTrackProgram':
      return setTrackProgram(song, action.trackIndex, action.program);
    case 'setTrackName':
      return setTrackName(song, action.trackIndex, action.name);
    case 'setTrackMute':
      return setTrackMute(song, action.trackIndex, action.isMute);
    case 'setTrackSolo':
      return setTrackSolo(song, action.trackIndex, action.isSolo);
    case 'setTrackVolume':
      return setTrackVolume(song, action.trackIndex, action.volume);
    case 'setTrackBalance':
      return setTrackBalance(song, action.trackIndex, action.balance);
    case 'setTrackCapo':
      return setTrackCapo(song, action.trackIndex, action.capo);
    case 'setTrackSlashNotation':
      return setTrackSlashNotation(song, action.trackIndex, action.hasSlashNotation);
    case 'setTrackLyrics':
      return setTrackLyrics(song, action.trackIndex, action.lyrics);
    case 'setTrackEffects':
      return setTrackEffects(song, action.trackIndex, action.effects);
    case 'setMasterMix':
      return setMasterMix(song, action.master);
    case 'setSongInfo':
      return setSongInfo(song, action.info);
  }
}
