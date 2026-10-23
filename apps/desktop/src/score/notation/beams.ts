import type { MeasureHeader } from '@gp-editor/core';
import {
  type Beam,
  type RhythmBeat,
  beamGroupBoundsOf,
  flagCount,
  layoutBeams,
} from '../../lib/beams';
import {
  type LineCommand,
  type PolygonCommand,
  SMUFL,
  type TextCommand,
} from '../draw';
import type { Chord, StemDirection } from './chords';
import type { StaffNote, VoiceEvent } from './events';
import { musicGlyph, polygon, vertical } from './glyphs';
import { BEAM, STAFF, STEM } from './metrics';

/** Events of one voice joined by beams (from `layoutBeams`), left to right. */
export interface BeamGroup {
  readonly members: readonly number[];
  readonly beams: readonly Beam[];
}

export interface BeamLine {
  readonly x0: number;
  readonly y0: number;
  readonly slope: number;
}

export interface BeamedChords {
  readonly chords: readonly Chord[];
  readonly beams: readonly Beam[];
  readonly line: BeamLine;
}

export function beamY(line: BeamLine, x: number): number {
  return line.y0 + line.slope * (x - line.x0);
}

/** Joins beam segments of the same level that meet, so a run of sixteenths has one secondary beam. */
function mergeBeams(beams: readonly Beam[]): Beam[] {
  return beams.reduce<Beam[]>((merged, beam) => {
    const last = merged[merged.length - 1];
    if (
      last !== undefined &&
      last.level === beam.level &&
      last.toX === beam.fromX
    ) {
      return [...merged.slice(0, -1), { ...last, toX: beam.toX }];
    }
    return [...merged, beam];
  }, []);
}

/** Beam groups of every voice, grouped by the bar's beam grouping and the beats' own beams, like the tab staff's rhythm. */
export function beamGroups(
  events: readonly VoiceEvent[],
  header: MeasureHeader,
): BeamGroup[] {
  const groupBounds = beamGroupBoundsOf(header);
  const voices = [...new Set(events.map(event => event.voiceIndex))];
  return voices.flatMap(voiceIndex => {
    const voice = events.flatMap((event, index) =>
      event.voiceIndex === voiceIndex ? [{ event, index }] : [],
    );
    const rhythm: RhythmBeat[] = voice.map(({ event }) => ({
      x: event.x,
      start: event.start,
      value: event.duration.value,
      isRest: event.notes.length === 0,
      ...(event.beamToNext === undefined
        ? {}
        : { beamToNext: event.beamToNext }),
    }));
    const layout = layoutBeams(rhythm, header.start, groupBounds);
    return layout.beams
      .filter(beam => beam.level === 1)
      .map(primary => ({
        members: voice
          .filter(
            ({ event }, k) =>
              layout.beamed.has(k) &&
              event.x >= primary.fromX &&
              event.x <= primary.toX,
          )
          .map(({ index }) => index),
        beams: mergeBeams(
          layout.beams.filter(
            beam => beam.fromX >= primary.fromX && beam.toX <= primary.toX,
          ),
        ),
      }));
  });
}

function directionOf(notes: readonly StaffNote[]): StemDirection {
  const average =
    notes.reduce((sum, note) => sum + note.position, 0) /
    Math.max(1, notes.length);
  return notes.length > 0 && average >= STAFF.middleLine ? 'down' : 'up';
}

/**
 * Stem direction per event: with a second voice, voice 1 up and the others down; otherwise the voice's own
 * direction or the average position of the beam group (or the chord) against the middle line.
 */
export function stemDirections(
  events: readonly VoiceEvent[],
  groups: readonly BeamGroup[],
  isMultiVoice: boolean,
): StemDirection[] {
  const groupOf = new Map(
    groups.flatMap(group =>
      group.members.map(member => [member, group] as const),
    ),
  );
  return events.map((event, index) => {
    if (isMultiVoice) {
      return event.voiceIndex === 0 ? 'up' : 'down';
    }
    const members = groupOf.get(index)?.members ?? [index];
    const lead = events[members[0] ?? index] ?? event;
    return lead.direction !== 'none'
      ? lead.direction
      : directionOf(members.flatMap(member => events[member]?.notes ?? []));
  });
}

/** A beam following the outer notes at a limited slant, moved out until every stem is long enough. */
function fitBeam(chords: readonly Chord[]): BeamLine {
  const first = chords[0];
  const last = chords[chords.length - 1];
  if (first === undefined || last === undefined) {
    return { x0: 0, y0: 0, slope: 0 };
  }
  const isUp = first.direction === 'up';
  const outer = (chord: Chord) =>
    isUp
      ? Math.min(...chord.heads.map(h => h.y))
      : Math.max(...chord.heads.map(h => h.y));
  const rise = Math.max(
    -BEAM.maxSlant,
    Math.min(BEAM.maxSlant, (outer(last) - outer(first)) * BEAM.slantRatio),
  );
  const run = last.stemX - first.stemX;
  const slope = run > 0 ? rise / run : 0;
  const offsets = chords.map(
    chord => chord.stemTip - slope * (chord.stemX - first.stemX),
  );
  return {
    x0: first.stemX,
    y0: isUp ? Math.min(...offsets) : Math.max(...offsets),
    slope,
  };
}

export function beamChords(
  groups: readonly BeamGroup[],
  chords: readonly (Chord | undefined)[],
): BeamedChords[] {
  return groups.flatMap(group => {
    const members = group.members.flatMap(index => {
      const chord = chords[index];
      return chord !== undefined && chord.hasStem ? [chord] : [];
    });
    return members.length < 2
      ? []
      : [{ chords: members, beams: group.beams, line: fitBeam(members) }];
  });
}

/** Where each stem ends: on its beam, or at its natural length. */
export function stemTips(
  chords: readonly (Chord | undefined)[],
  beamed: readonly BeamedChords[],
): (number | undefined)[] {
  const onBeam = new Map(
    beamed.flatMap(group =>
      group.chords.map(
        chord => [chord.eventIndex, beamY(group.line, chord.stemX)] as const,
      ),
    ),
  );
  return chords.map(chord =>
    chord?.hasStem ? onBeam.get(chord.eventIndex) ?? chord.stemTip : undefined,
  );
}

export function stems(
  chords: readonly (Chord | undefined)[],
  tips: readonly (number | undefined)[],
  color: string,
): LineCommand[] {
  return chords.flatMap((chord, i) => {
    const tip = tips[i];
    return chord === undefined || tip === undefined
      ? []
      : [vertical(chord.stemX, chord.stemBase, tip, STEM.width, color)];
  });
}

/** Beam polygons: the primary beam's outer edge on the beam line, secondary beams stacked towards the notes. */
export function beamPolygons(
  group: BeamedChords,
  color: string,
): PolygonCommand[] {
  const first = group.chords[0];
  if (first === undefined) {
    return [];
  }
  const inward = first.direction === 'up' ? 1 : -1;
  const stemOffset = first.stemX - first.event.x;
  return group.beams.map(beam => {
    const x1 = beam.fromX + stemOffset - STEM.width / 2;
    const x2 = beam.toX + stemOffset + STEM.width / 2;
    const shift = inward * (beam.level - 1) * BEAM.spacing;
    const y1 = beamY(group.line, x1) + shift;
    const y2 = beamY(group.line, x2) + shift;
    const thickness = inward * BEAM.thickness;
    return polygon(
      [x1, y1, x2, y2, x2, y2 + thickness, x1, y1 + thickness],
      color,
    );
  });
}

/** Event indexes of chords drawn with flags: stemmed, shorter than a quarter and not beamed. */
export function flaggedChords(
  chords: readonly (Chord | undefined)[],
  beamed: readonly BeamedChords[],
): ReadonlySet<number> {
  const isBeamed = new Set(
    beamed.flatMap(group => group.chords.map(chord => chord.eventIndex)),
  );
  return new Set(
    chords.flatMap(chord =>
      chord !== undefined &&
      chord.hasStem &&
      !isBeamed.has(chord.eventIndex) &&
      flagCount(chord.event.duration.value) > 0
        ? [chord.eventIndex]
        : [],
    ),
  );
}

export function flags(
  chords: readonly (Chord | undefined)[],
  tips: readonly (number | undefined)[],
  flagged: ReadonlySet<number>,
  color: string,
): TextCommand[] {
  return chords.flatMap((chord, i) => {
    const tip = tips[i];
    if (
      chord === undefined ||
      tip === undefined ||
      !flagged.has(chord.eventIndex)
    ) {
      return [];
    }
    const glyphs = chord.direction === 'up' ? SMUFL.flagUp : SMUFL.flagDown;
    const glyph =
      glyphs[
        Math.min(glyphs.length, flagCount(chord.event.duration.value)) - 1
      ] ?? glyphs[0];
    return [musicGlyph(chord.stemX - STEM.width / 2, tip, glyph, color)];
  });
}
