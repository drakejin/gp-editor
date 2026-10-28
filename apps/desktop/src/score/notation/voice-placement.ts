import type { Measure, Track } from '@gp-editor/core';
import type { NextInRow } from '../symbols/links';
import { type BeamGroup, beamGroups, stemDirections } from './beams';
import { type Chord, type NoteHead, layoutChord } from './chords';
import { separateVoices } from './collisions';
import { type VoiceEvent, buildVoiceEvents } from './events';
import { clefKind } from './pitch';

/** Where a measure's voices sit together: with more than one voice, noteheads and rests of different voices apart. */
export interface PlacedVoices {
  readonly events: readonly VoiceEvent[];
  readonly isMultiVoice: boolean;
}

export function placeVoices(placed: readonly VoiceEvent[]): PlacedVoices {
  const isMultiVoice = placed.some(event => event.voiceIndex > 0);
  return { events: isMultiVoice ? separateVoices(placed) : placed, isMultiVoice };
}

/** The events' chords: stems by voice or by beam group, noteheads at their staff positions; none for a rest. */
export function layoutChords(
  events: readonly VoiceEvent[],
  groups: readonly BeamGroup[],
  isMultiVoice: boolean,
  top: number,
): (Chord | undefined)[] {
  const directions = stemDirections(events, groups, isMultiVoice);
  return events.map((event, index) =>
    event.notes.length === 0
      ? undefined
      : layoutChord(event, index, directions[index] ?? 'up', top),
  );
}

/** A notehead on `string` in voice `voiceIndex` at beat `beatIndex`, with its chord. */
export type HeadLookup = (
  beatIndex: number,
  voiceIndex: number,
  string: number,
) => { readonly chord: Chord; readonly head: NoteHead } | undefined;

/**
 * The noteheads of the next measure on the row, placed as that measure's own engraving places them and moved right by
 * `offset` (this measure's width) into this measure's coordinates: where slurs and slides across the bar line end. Laid
 * out on first use, as few measures link anything across their bar line.
 */
export function nextMeasureHeads(
  track: Track,
  measure: Measure,
  next: NextInRow,
  top: number,
  offset: number,
): HeadLookup {
  let chords: readonly (Chord | undefined)[] | undefined;
  const layoutOnce = (): readonly (Chord | undefined)[] => {
    const raw = buildVoiceEvents(track, measure, next.layout, clefKind(track, measure.clef));
    const { events, isMultiVoice } = placeVoices(raw);
    const shifted = events.map(event => ({ ...event, x: event.x + offset }));
    return layoutChords(shifted, beamGroups(shifted, next.header), isMultiVoice, top);
  };
  return (beatIndex, voiceIndex, string) => {
    chords = chords ?? layoutOnce();
    const chord = chords.find(
      candidate =>
        candidate?.event.beatIndex === beatIndex &&
        candidate.event.voiceIndex === voiceIndex,
    );
    const head = chord?.heads.find(h => h.note.string === string);
    return chord === undefined || head === undefined ? undefined : { chord, head };
  };
}
