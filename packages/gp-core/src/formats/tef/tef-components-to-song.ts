// Port of TuxGuitar app.tuxguitar.io.tef3.TESongParser.addComponents (with addNote, addChord, addRest, addTextEvent,
// addTempoChange and addEnding) (LGPL-2.1).
import type { Note } from '../../model/song';
import { type DraftBeat, type DraftTrack, type DraftVoice, type SongDraft } from '../common/song-draft';
import { buildChord } from '../gtp/shared';
import { durationFromTef, velocityFromDynamic } from './tef-durations';
import { TE_PERCUSSION_PROGRAM, type TeChord, type TeComponent, type TeEnding, type TeNote, type TeRest, type TeSong, type TeTempoChange } from './tef-model';
import { TE_TIE_DYNAMIC, noteEffectOf, withGraceMetadata } from './tef-note-effects';

/** PERCUSSION_TUNINGS: the drum notes of a drum track's strings, by string count (3 … 7). */
const PERCUSSION_TUNINGS: readonly (readonly number[])[] = [
  [49, 41, 32],
  [49, 51, 42, 50],
  [49, 42, 50, 37, 32],
  [49, 51, 42, 50, 45, 37],
  [49, 51, 42, 50, 45, 37, 41],
];
const UP_STROKE = 3;
const DOWN_STROKE = 4;
/** A stroke on a note becomes a sixteenth-speed stroke on its beat. */
const STROKE_VALUE = 16;
const LOWER_VOICE = 3;

/** Where the last note read on each string of each track is (for the grace-note metadata after it). */
interface NoteRef {
  readonly voice: DraftVoice;
  readonly index: number;
}

interface Context {
  readonly draft: SongDraft;
  readonly song: TeSong;
  readonly offsets: ReadonlyMap<TeComponent, number>;
  readonly lastNotes: Map<string, NoteRef>;
}

/** addComponents: each component, sorted, onto the beat at its place in its track's measure. */
export function addComponents(draft: SongDraft, song: TeSong, components: readonly TeComponent[], offsets: ReadonlyMap<TeComponent, number>): void {
  const context: Context = { draft, song, offsets, lastNotes: new Map() };
  for (const component of components) {
    const track = draft.tracks[component.at.trackIndex];
    const measure = track?.measures[component.at.measure];
    if (track === undefined || measure === undefined) {
      continue;
    }
    if (component.kind === 'graceMetadata') {
      const ref = context.lastNotes.get(stringKey(component));
      const note = ref?.voice.notes[ref.index];
      if (ref !== undefined && note !== undefined) {
        ref.voice.notes[ref.index] = { ...note, effect: withGraceMetadata(note.effect, component) };
      }
      continue;
    }
    if (component.kind === 'tempo' || component.kind === 'ending') {
      applyToHeader(context, component);
      continue;
    }
    const beat = draft.beatAt(measure, measure.header.start + (offsets.get(component) ?? 0));
    addToBeat(context, track, component, beat);
  }
}

function stringKey(component: TeComponent): string {
  return `${component.at.trackIndex}:${component.at.string}`;
}

function addToBeat(context: Context, track: DraftTrack, component: TeComponent, beat: DraftBeat): void {
  switch (component.kind) {
    case 'note':
      addNote(context, track, component, beat);
      break;
    case 'rest':
      addRest(component, beat);
      break;
    case 'chord':
      addChord(context.song, track, component, beat);
      break;
    case 'text': {
      const text = context.song.songMetadata.textEvents[component.textIndex];
      if (text !== undefined) {
        beat.text = text;
      }
      break;
    }
    default:
      break;
  }
}

function addNote(context: Context, track: DraftTrack, component: TeNote, beat: DraftBeat): void {
  const teTrack = context.song.tracks[component.at.trackIndex];
  const note: Note = {
    fret: component.fret + (teTrack?.midiInstrument === TE_PERCUSSION_PROGRAM ? percussionBase(track.strings.length, component.at.string) : 0),
    velocity: velocityFromDynamic(component.dynamics),
    string: component.at.string + 1,
    isTied: component.isTied || component.dynamics === TE_TIE_DYNAMIC,
    effect: noteEffectOf(component),
  };
  if (component.stroke === UP_STROKE || component.stroke === DOWN_STROKE) {
    beat.stroke = { direction: component.stroke === UP_STROKE ? 'up' : 'down', value: STROKE_VALUE };
  }
  const voice = component.attributes === LOWER_VOICE ? beat.voices[1] : beat.voices[0];
  voice.duration = durationFromTef(component.duration);
  voice.isEmpty = false;
  voice.notes.push(note);
  context.lastNotes.set(stringKey(component), { voice, index: voice.notes.length - 1 });
}

/** The drum note a drum track's string adds to the fret (none for fewer than three strings, where TuxGuitar fails). */
function percussionBase(stringCount: number, string: number): number {
  const tuning = PERCUSSION_TUNINGS[Math.min(stringCount - 2, PERCUSSION_TUNINGS.length) - 1];
  return tuning?.[string] ?? 0;
}

/**
 * addRest. TuxGuitar empties the voice at the rest (its notes too) and leaves it empty; here a voice without notes becomes
 * a rest of the written length, and notes are kept.
 */
function addRest(component: TeRest, beat: DraftBeat): void {
  const voice = component.isLowerVoice ? beat.voices[1] : beat.voices[0];
  if (voice.notes.length === 0) {
    voice.duration = durationFromTef(component.duration);
    voice.isEmpty = false;
  }
}

function addChord(song: TeSong, track: DraftTrack, component: TeChord, beat: DraftBeat): void {
  const definition = song.chordDefinitions[component.chordIndex];
  const chord = definition === undefined ? undefined : buildChord(definition.name, 0, definition.frets, track.strings.length);
  if (chord !== undefined) {
    beat.chord = chord;
  }
}

/** addTempoChange (the tempo from this measure to the end) and addEnding (repeat brackets and alternate endings). */
function applyToHeader(context: Context, component: TeTempoChange | TeEnding): void {
  const headers = context.draft.headers;
  const header = headers[component.at.measure];
  if (header === undefined) {
    return;
  }
  if (component.kind === 'tempo') {
    for (const next of component.bpm > 0 ? headers.slice(component.at.measure) : []) {
      next.tempo = component.bpm;
    }
    return;
  }
  if (component.isOpenBracket) {
    header.repeatOpen = true;
  }
  if (component.isCloseBracket && component.endingNumber >= 2) {
    header.repeatClose = component.endingNumber - 1;
  } else if (header.repeatClose === 0 && component.endingNumber !== 0) {
    header.repeatAlternative = 1 << (component.endingNumber - 1);
  }
}
