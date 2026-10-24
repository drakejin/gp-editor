import { expect } from 'vitest';
import { FINGERS } from '../../src/formats/common/fingering';
import { ACCIDENTAL_DISPLAYS, BEAM_LINKS } from '../../src/edit/notation-marks';
import { isNoteValue } from '../../src/model/defaults';
import type { MeasureHeader, Note, Song, Voice } from '../../src/model/song';

const isOneOf = <T>(value: T | undefined, allowed: readonly T[]): boolean => value === undefined || allowed.includes(value);

function headerViolations(header: MeasureHeader): string[] {
  const grouping = header.beamGrouping;
  const isValid = grouping === undefined || (isNoteValue(grouping.unit) && grouping.groups.length > 0 && grouping.groups.every((size) => Number.isInteger(size) && size >= 1));
  return isValid ? [] : [`bar ${header.number}: beam grouping ${JSON.stringify(grouping)}`];
}

function voiceViolations(voice: Voice): string[] {
  const own = [
    ...(isOneOf(voice.isSlashed, [true]) ? [] : [`isSlashed ${String(voice.isSlashed)}`]),
    ...(isOneOf(voice.beamToNext, BEAM_LINKS) ? [] : [`beamToNext ${String(voice.beamToNext)}`]),
  ];
  return [...own, ...voice.notes.flatMap(noteViolations)];
}

function noteViolations(note: Note): string[] {
  const isValid = isOneOf(note.leftFinger, FINGERS) && isOneOf(note.rightFinger, FINGERS) && isOneOf(note.accidentalDisplay, ACCIDENTAL_DISPLAYS);
  return isValid ? [] : [`note on string ${note.string}: ${JSON.stringify([note.leftFinger, note.rightFinger, note.accidentalDisplay])}`];
}

/**
 * Notation marks are left out when unset (never false or empty) and hold only the model's values. Gathered first and
 * checked once: the edit sweeps run this on thousands of songs.
 */
export function assertNotationMarks(song: Song): void {
  const violations = [
    ...song.measureHeaders.flatMap(headerViolations),
    ...song.tracks.flatMap((track) => [
      ...(isOneOf(track.hasSlashNotation, [true]) ? [] : [`track ${track.number}: hasSlashNotation false`]),
      ...track.measures.flatMap((measure) => measure.beats.flatMap((beat) => beat.voices.flatMap(voiceViolations))),
    ]),
  ];
  expect(violations).toEqual([]);
}
