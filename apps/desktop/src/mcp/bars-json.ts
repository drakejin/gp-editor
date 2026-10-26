// i18n-exempt-file: JSON keys and effect names for MCP clients, never shown in the app
// A track's bars as JSON for an MCP client: each voice's beats with their place in the bar, duration, notes (string 1 =
// highest, fret) and effects, in 1-based musical numbering. Read-only views of the model (gp-core's song.ts names).

import {
  type Beat,
  type Duration,
  type MeasureHeader,
  type Note,
  type NoteEffect,
  QUARTER,
  type Song,
  type Tuplet,
  durationTicks,
} from '@gp-editor/core';
import type { JsonObject } from './json-rpc';

/** Note effects named by their model flag when set. */
const FLAG_EFFECTS: readonly (keyof NoteEffect)[] = [
  'letRing', 'palmMute', 'hammer', 'vibrato', 'wideVibrato', 'deadNote', 'ghostNote', 'accentuatedNote', 'heavyAccentuatedNote', 'staccato',
  'tapping', 'slapping', 'popping', 'fadeIn', 'fadeOut', 'volumeSwell',
];

/** Optional parts of a note's effect, named when present. */
const PART_EFFECTS: readonly (keyof NoteEffect)[] = ['bend', 'tremoloBar', 'grace', 'trill', 'tremoloPicking'];

function tupletText(tuplet: Tuplet): string {
  return `${tuplet.enters}:${tuplet.times}`;
}

function isTuplet(tuplet: Tuplet | undefined): tuplet is Tuplet {
  return tuplet !== undefined && tuplet.enters !== tuplet.times;
}

/** A duration: its note value (4 = quarter), dots, and the tuplet it is in ("3:2"). */
function durationJson(duration: Duration): JsonObject {
  const dots = duration.doubleDotted ? 2 : duration.dotted ? 1 : 0;
  return {
    value: duration.value,
    dots,
    ...(isTuplet(duration.tuplet) ? { tuplet: tupletText(duration.tuplet) } : {}),
    ...(isTuplet(duration.innerTuplet) ? { innerTuplet: tupletText(duration.innerTuplet) } : {}),
  };
}

/** The effects set on a note, by their model names ("palmMute", "slide:shiftSlide", "harmonic:natural", "bend"). */
function noteEffects(effect: NoteEffect): readonly string[] {
  const flags = FLAG_EFFECTS.filter((name) => effect[name] === true).map(String);
  const parts = PART_EFFECTS.filter((name) => effect[name] !== undefined).map(String);
  const slides = effect.slides.map((slide) => `slide:${slide}`);
  const harmonic = effect.harmonic === undefined ? [] : [`harmonic:${effect.harmonic.type}`];
  return [...flags, ...slides, ...harmonic, ...parts];
}

function noteJson(note: Note): JsonObject {
  const effects = noteEffects(note.effect);
  return { string: note.string, fret: note.fret, ...(note.isTied ? { tied: true } : {}), ...(effects.length > 0 ? { effects } : {}) };
}

/** Where a beat starts in its bar, in quarter notes (0 = the bar's start). */
function quartersIntoBar(beat: Beat, header: MeasureHeader): number {
  return Math.round(((beat.start - header.start) / durationTicks(QUARTER)) * 10_000) / 10_000;
}

function beatJson(beat: Beat, beatIndex: number, voiceIndex: number, header: MeasureHeader): JsonObject | undefined {
  const voice = beat.voices[voiceIndex];
  if (voice === undefined || voice.isEmpty) {
    return undefined;
  }
  const notes = [...voice.notes].sort((a, b) => a.string - b.string).map(noteJson);
  return {
    beat: beatIndex + 1,
    at: quartersIntoBar(beat, header),
    duration: durationJson(voice.duration),
    ...(notes.length === 0 ? { rest: true } : { notes }),
    ...(beat.text === undefined || beat.text === '' ? {} : { text: beat.text }),
    ...(beat.chord === undefined ? {} : { chord: beat.chord.name }),
  };
}

function voicesJson(beats: readonly Beat[], header: MeasureHeader, voiceIndexes: readonly number[]): readonly JsonObject[] {
  return voiceIndexes.flatMap((voiceIndex) => {
    const played = beats.flatMap((beat, beatIndex) => beatJson(beat, beatIndex, voiceIndex, header) ?? []);
    return played.length === 0 ? [] : [{ voice: voiceIndex + 1, beats: played }];
  });
}

/** One bar of a track: its number, meter, tempo, key and marks, and the beats of the voices asked for (0-based). */
export function barJson(song: Song, trackIndex: number, measureIndex: number, voiceIndexes: readonly number[]): JsonObject | undefined {
  const header = song.measureHeaders[measureIndex];
  const measure = song.tracks[trackIndex]?.measures[measureIndex];
  if (header === undefined || measure === undefined) {
    return undefined;
  }
  const { numerator, denominator } = header.timeSignature;
  return {
    bar: header.number,
    timeSignature: `${numerator}/${denominator}`,
    tempo: header.tempo,
    keySignature: measure.keySignature,
    ...(header.marker === undefined ? {} : { section: header.marker.title }),
    ...(header.repeatOpen ? { repeatOpen: true } : {}),
    ...(header.repeatClose > 0 ? { repeatClose: header.repeatClose } : {}),
    voices: voicesJson(measure.beats, header, voiceIndexes),
  };
}

/** The beat at a cursor, in the cursor's voice; undefined where that voice has no beat. */
export function beatAtJson(song: Song, at: { readonly trackIndex: number; readonly measureIndex: number; readonly beatIndex: number; readonly voiceIndex: number }): JsonObject | undefined {
  const header = song.measureHeaders[at.measureIndex];
  const beat = song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex];
  return header === undefined || beat === undefined ? undefined : beatJson(beat, at.beatIndex, at.voiceIndex, header);
}
