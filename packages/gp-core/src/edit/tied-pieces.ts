import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { Duration, Note, NoteEffect, SlideType, Voice } from '../model/song';
import { restDurations } from './rests';
import type { VoiceEvent } from './timeline';

/** Slides that lead out of a note (to the next one, or away): they go with the last piece of a split note. */
const OUTGOING_SLIDES: readonly SlideType[] = ['shift', 'legato', 'outDownwards', 'outUpwards'];

type PieceRole = 'first' | 'middle' | 'last';

/** What a tied continuation keeps sounding: vibrato, palm mute, let ring, a harmonic, a trill, tremolo picking. */
function sustainedEffect(effect: NoteEffect): NoteEffect {
  return {
    ...EMPTY_NOTE_EFFECT,
    vibrato: effect.vibrato,
    wideVibrato: effect.wideVibrato,
    palmMute: effect.palmMute,
    letRing: effect.letRing,
    ...(effect.harmonic === undefined ? {} : { harmonic: effect.harmonic }),
    ...(effect.trill === undefined ? {} : { trill: effect.trill }),
    ...(effect.tremoloPicking === undefined ? {} : { tremoloPicking: effect.tremoloPicking }),
  };
}

/**
 * The piece of a note split at bar lines: the first keeps how the note starts (attack, grace, bend …) but not what
 * leads to the next note (hammer, outgoing slides), which the last gets; later pieces are tied and keep what sustains.
 */
function pieceNote(note: Note, role: PieceRole): Note {
  const { effect } = note;
  const outgoing = effect.slides.filter((slide) => OUTGOING_SLIDES.includes(slide));
  if (role === 'first') {
    const isUnchanged = !effect.hammer && outgoing.length === 0;
    return isUnchanged ? note : { ...note, effect: { ...effect, hammer: false, slides: effect.slides.filter((slide) => !outgoing.includes(slide)) } };
  }
  const sustained = sustainedEffect(effect);
  const pieceEffect = role === 'middle' ? sustained : { ...sustained, hammer: effect.hammer, slides: outgoing };
  return { ...note, isTied: true, effect: pieceEffect };
}

function pieceEvent(event: VoiceEvent, duration: Duration, role: PieceRole): VoiceEvent {
  const voice: Voice = { ...event.voice, duration, notes: event.voice.notes.map((note) => pieceNote(note, role)) };
  return role === 'first' && event.attributes !== undefined ? { voice, attributes: event.attributes } : { voice };
}

function roleAt(index: number, count: number): PieceRole {
  return index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';
}

/**
 * The event cut into one share per bar it reaches (`shares`: ticks left in its bar, then each later bar's part), each
 * share written as plain or dotted durations, also in the event's tuplet. A rest becomes rests; notes go on as tied
 * notes (see pieceNote), and the beat marks stay on the first piece. Undefined when a share cannot be written.
 */
export function splitAtBarLines(event: VoiceEvent, shares: readonly number[]): readonly (readonly VoiceEvent[])[] | undefined {
  const tuplet = event.voice.duration.tuplet;
  const durations = shares.map((ticks) => restDurations(ticks, undefined, tuplet));
  if (!durations.every((list): list is readonly Duration[] => list !== undefined)) {
    return undefined;
  }
  const pieces = durations.flatMap((list, share) => list.map((duration) => ({ share, duration })));
  const events = pieces.map((piece, index) => ({ share: piece.share, event: pieceEvent(event, piece.duration, roleAt(index, pieces.length)) }));
  return shares.map((_ticks, share) => events.flatMap((piece) => (piece.share === share ? [piece.event] : [])));
}
