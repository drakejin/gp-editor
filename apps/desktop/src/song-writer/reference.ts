// i18n-exempt-file: the open score described for Claude's prompt, never shown
import type { Duration, Measure, Note, Song, Track } from '@gp-editor/core';
import { pitchName, tuningLabel } from '../lib/pitch';

/** Bars of the open score the song writer is shown: enough for its motifs and groove, little enough to keep requests small. */
const MAX_REFERENCE_BARS = 16;

const VALUE_CODES: Readonly<Record<number, string>> = { 1: 'w', 2: 'h', 4: 'q', 8: 'e', 16: 's', 32: 't', 64: 'x' };

const LEGEND = 'Each beat is duration:notes — w h q e s t x (whole … 64th), "." dotted, "/3" a triplet; a note is its sounding pitch @ string/fret, "~" tied, "x" dead; r = rest.';

function durationCode(duration: Duration): string {
  const dots = duration.doubleDotted ? '..' : duration.dotted ? '.' : '';
  const tuplet = duration.tuplet.enters === duration.tuplet.times ? '' : `/${duration.tuplet.enters}`;
  return `${VALUE_CODES[duration.value] ?? '?'}${dots}${tuplet}`;
}

/** A note as it sounds (capo counted) and where it is played: "E4@1/0". */
function noteCode(track: Track, note: Note): string {
  const tuning = track.strings[note.string - 1]?.tuning;
  const pitch = tuning === undefined ? '?' : note.effect.deadNote ? 'x' : pitchName(tuning + track.offset + note.fret);
  return `${note.isTied ? '~' : ''}${pitch}@${note.string}/${note.fret}`;
}

function soundingPitch(track: Track, note: Note): number {
  return (track.strings[note.string - 1]?.tuning ?? 0) + track.offset + note.fret;
}

/** A bar's first voice, beat by beat; undefined when it has no notes. */
function describeBar(track: Track, measure: Measure, barNumber: number): string | undefined {
  const voices = measure.beats.flatMap((beat) => beat.voices[0] ?? []).filter((voice) => !voice.isEmpty);
  if (!voices.some((voice) => voice.notes.length > 0)) {
    return undefined;
  }
  const beats = voices.map((voice) => {
    const notes = [...voice.notes].sort((a, b) => soundingPitch(track, a) - soundingPitch(track, b));
    return `${durationCode(voice.duration)}:${notes.length === 0 ? 'r' : notes.map((note) => noteCode(track, note)).join(',')}`;
  });
  return `Bar ${barNumber}: ${beats.join(' ')}`;
}

/**
 * The shown track of the open score as text for the song writer: its tempo, meter and tuning, then its first bars with
 * notes. Undefined when the track has no notes.
 */
export function describeReference(song: Song, trackIndex: number): string | undefined {
  const track = song.tracks[trackIndex];
  if (track === undefined || track.isPercussion) {
    return undefined;
  }
  const bars = track.measures.flatMap((measure, index) => describeBar(track, measure, index + 1) ?? []).slice(0, MAX_REFERENCE_BARS);
  if (bars.length === 0) {
    return undefined;
  }
  const first = song.measureHeaders[0];
  const meter = first === undefined ? '' : `♩ = ${first.tempo}, ${first.timeSignature.numerator}/${first.timeSignature.denominator}. `;
  const capo = track.offset > 0 ? `, capo ${track.offset}` : '';
  const heading = `"${song.info.title || 'Untitled'}" — ${meter}Track "${track.name}" (${tuningLabel(track.strings.map((string) => string.tuning))}${capo}).`;
  return [heading, LEGEND, ...bars].join('\n');
}
