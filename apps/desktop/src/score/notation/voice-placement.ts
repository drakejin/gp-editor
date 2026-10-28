import type { Measure, Track } from '@gp-editor/core';
import type { NextInRow } from '../symbols/links';
import { type BeamGroup, beamGroups, stemDirections } from './beams';
import { type Chord, layoutChord } from './chords';
import { separateVoices } from './collisions';
import { type VoiceEvent, buildVoiceEvents } from './events';
import { clefKind } from './pitch';
import { type NextBar, type VoiceLayout, headOnString } from './voice-layout';

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

/** Where the next measure's noteheads go: its staff's top, this measure's width, the track's written transposition. */
export interface NextMeasurePlacement {
  readonly top: number;
  readonly offset: number;
  /** Semitones the track's notes are written above their sound (`trackTransposition`). */
  readonly transposition: number;
}

/**
 * The noteheads of the next measure on the row, placed as that measure's own engraving places them and moved right by
 * `offset` (this measure's width) into this measure's coordinates: where slurs and slides across the bar line end. Laid
 * out on first use, as few measures link anything across their bar line.
 */
export function nextMeasureHeads(
  track: Track,
  measure: Measure,
  next: NextInRow,
  { top, offset, transposition }: NextMeasurePlacement,
): NextBar['headOn'] {
  let placed: Pick<VoiceLayout, 'events' | 'chords'> | undefined;
  const layoutOnce = (): Pick<VoiceLayout, 'events' | 'chords'> => {
    const raw = buildVoiceEvents(track, measure, next.layout, clefKind(track, measure.clef), transposition);
    const { events, isMultiVoice } = placeVoices(raw);
    const shifted = events.map(event => ({ ...event, x: event.x + offset }));
    return { events: shifted, chords: layoutChords(shifted, beamGroups(shifted, next.header), isMultiVoice, top) };
  };
  return (beatIndex, voiceIndex, string) => {
    placed = placed ?? layoutOnce();
    return headOnString(placed, beatIndex, voiceIndex, string);
  };
}
