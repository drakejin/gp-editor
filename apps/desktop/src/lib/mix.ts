import { DEFAULT_MASTER, type Effect, type MasterMix, type Song } from '@gp-editor/core';

/** What the playback engine plays the song's effects with (GPMixGraph's applyMix): a chain per track, the master. */
export interface MixLayout {
  /** One entry per track: its effects, or null when it has none (it plays on the shared instrument). */
  readonly tracks: readonly (readonly Effect[] | null)[];
  readonly master: MasterMix;
}

/** A chain or master being dragged: heard at once, written into the song when the drag ends. */
export type MixPreview = { readonly trackIndex: number; readonly effects: readonly Effect[] } | { readonly master: MasterMix };

export function mixOf(song: Song): MixLayout {
  return {
    tracks: song.tracks.map((track) => (track.effects === undefined || track.effects.length === 0 ? null : track.effects)),
    master: song.master ?? DEFAULT_MASTER,
  };
}

function hasChain(song: Song, trackIndex: number): boolean {
  return (song.tracks[trackIndex]?.effects?.length ?? 0) > 0;
}

/**
 * True while the same tracks have effects: a track that gets its first effect, or loses its last, moves to
 * instruments of its own (or back to the shared one), which only a new start of playback picks up.
 */
export function hasSameEffectRouting(played: Song, next: Song): boolean {
  return played.tracks.length === next.tracks.length && played.tracks.every((_, index) => hasChain(played, index) === hasChain(next, index));
}

/** The mix with a dragged chain or master in place. */
export function withPreview(mix: MixLayout, preview: MixPreview): MixLayout {
  if ('master' in preview) {
    return { ...mix, master: preview.master };
  }
  return { ...mix, tracks: mix.tracks.map((effects, index) => (index === preview.trackIndex ? (preview.effects.length > 0 ? preview.effects : null) : effects)) };
}

/** The same chains (the same objects, as an unchanged song keeps them) and the same master. */
export function isSameMixLayout(a: MixLayout, b: MixLayout): boolean {
  return a.master === b.master && a.tracks.length === b.tracks.length && a.tracks.every((effects, index) => effects === b.tracks[index]);
}
