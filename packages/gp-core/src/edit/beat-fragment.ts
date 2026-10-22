import { NO_STROKE } from '../model/defaults';
import type { Beat, Chord, Duration, Note, Stroke, StrokeDirection, Voice } from '../model/song';
import type { VoiceEvent, VoiceEvents } from './timeline';

/** One beat of a fragment: one voice's event with the marks of its beat. */
export interface BeatFragmentItem {
  readonly duration: Duration;
  /** Notes with their effects; empty for a rest. */
  readonly notes: readonly Note[];
  readonly stroke: Stroke;
  readonly pickStroke: StrokeDirection;
  readonly chord?: Chord;
  readonly text?: string;
}

/** A run of one voice's beats lifted out of their bars (copy, cut, paste). */
export interface BeatFragment {
  /** Lifted from a drum track, whose frets are MIDI percussion keys; it pastes into drum tracks only. */
  readonly isPercussion: boolean;
  readonly items: readonly BeatFragmentItem[];
}

/** The item for a voice's event; the marks come from its beat (none for a rest an edit added). */
export function fragmentItem(voice: Voice, beat: Beat | undefined): BeatFragmentItem {
  return {
    duration: voice.duration,
    notes: voice.notes,
    stroke: beat?.stroke ?? NO_STROKE,
    pickStroke: beat?.pickStroke ?? 'none',
    ...(beat?.chord === undefined ? {} : { chord: beat.chord }),
    ...(beat?.text === undefined ? {} : { text: beat.text }),
  };
}

/** A voice event that plays the item, carrying its beat marks. */
export function itemEvent(item: BeatFragmentItem): VoiceEvent {
  const voice: Voice = { duration: item.duration, notes: item.notes, isEmpty: false, direction: 'none' };
  const chord = item.chord === undefined ? {} : { chord: item.chord };
  const text = item.text === undefined ? {} : { text: item.text };
  return { voice, attributes: { stroke: item.stroke, pickStroke: item.pickStroke, ...chord, ...text } };
}

function untied(notes: readonly Note[], keepsTie: (note: Note) => boolean): readonly Note[] {
  return notes.some((note) => note.isTied && !keepsTie(note)) ? notes.map((note) => (note.isTied && !keepsTie(note) ? { ...note, isTied: false } : note)) : notes;
}

/**
 * The items with every tie that does not start inside the fragment removed: a tied note keeps its tie only when the
 * item before it has a note on the same string (so the first item has no ties).
 */
export function settleFragmentTies(items: readonly BeatFragmentItem[]): readonly BeatFragmentItem[] {
  return items.map((item, index) => {
    const previous = items[index - 1]?.notes ?? [];
    const notes = untied(item.notes, (note) => previous.some((other) => other.string === note.string));
    return notes === item.notes ? item : { ...item, notes };
  });
}

/** The events with the first one's ties removed: it no longer follows the note its ties started on. */
export function untieFirst(events: VoiceEvents): VoiceEvents {
  const [first, ...others] = events;
  if (first === undefined) {
    return events;
  }
  const notes = untied(first.voice.notes, () => false);
  return notes === first.voice.notes ? events : [{ ...first, voice: { ...first.voice, notes } }, ...others];
}
