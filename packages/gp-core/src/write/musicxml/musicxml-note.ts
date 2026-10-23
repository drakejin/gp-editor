// Port of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLWriter#writeNote / #writeDurationAndVoice / #insertRest / #writePlay (LGPL-2.1).
import type { Duration, NoteValue } from '../../model/song';
import { spellPitch } from './musicxml-pitch';
import { type XmlAttributes, type XmlChild, type XmlNode, element, textElement } from './xml-text';

/** MusicXML's note type of each note value (DURATION_NAMES). */
export const NOTE_TYPES: Readonly<Record<NoteValue, string>> = {
  1: 'whole',
  2: 'half',
  4: 'quarter',
  8: 'eighth',
  16: '16th',
  32: '32nd',
  64: '64th',
};

/** `<pitch>` or `<staff-tuning>` content: step, alter (left out when natural) and octave, names prefixed (writeNote). */
export function pitchChildren(midiPitch: number, keySignature: number, prefix = ''): XmlNode[] {
  const spelled = spellPitch(midiPitch, keySignature);
  return [
    textElement(`${prefix}step`, spelled.step),
    ...(spelled.alter === 0 ? [] : [textElement(`${prefix}alter`, spelled.alter)]),
    textElement(`${prefix}octave`, spelled.octave),
  ];
}

export function pitchElement(midiPitch: number, keySignature: number): XmlNode {
  return element('pitch', {}, pitchChildren(midiPitch, keySignature));
}

/** A drum note's place on the staff: the line or space of the key's pitch spelled in C (a place has no alteration). */
export function unpitchedElement(midiKey: number): XmlNode {
  return element(
    'unpitched',
    {},
    pitchChildren(midiKey, 0, 'display-').filter((child) => child.name !== 'display-alter'),
  );
}

/** The pieces of one `<note>`, written in the order the MusicXML schema requires. */
export interface NoteParts {
  readonly attributes?: XmlAttributes;
  /** `<grace>`: a grace note has no duration. */
  readonly grace?: XmlNode;
  readonly isChord: boolean;
  /** `<pitch>`, `<unpitched>` or `<rest>`. */
  readonly sound: XmlNode;
  readonly ticks?: number;
  readonly ties?: readonly ('start' | 'stop')[];
  /** Percussion: the score-instrument the note plays. */
  readonly instrument?: string;
  readonly voice: number;
  /** The written duration; absent for a whole-measure rest. */
  readonly duration?: Duration;
  /** A grace note's type (it has no Duration). */
  readonly graceType?: string;
  readonly hasStem?: boolean;
  readonly notehead?: XmlNode;
  readonly staff: number;
  readonly notations?: XmlNode;
  readonly lyric?: XmlNode;
  readonly play?: XmlNode;
}

function durationChildren(duration: Duration | undefined): XmlChild[] {
  if (duration === undefined) {
    return [];
  }
  const dots = duration.doubleDotted ? 2 : duration.dotted ? 1 : 0;
  const { tuplet } = duration;
  return [
    textElement('type', NOTE_TYPES[duration.value]),
    ...Array.from({ length: dots }, () => element('dot')),
    tuplet.enters !== tuplet.times &&
      element('time-modification', {}, [textElement('actual-notes', tuplet.enters), textElement('normal-notes', tuplet.times)]),
  ];
}

/** `<note>` with its children in schema order: grace, chord, pitch, duration, tie, instrument, voice, type, dot, time-modification, stem, notehead, staff, notations, lyric, play. */
export function noteElement(parts: NoteParts): XmlNode {
  return element('note', parts.attributes, [
    parts.grace,
    parts.isChord && element('chord'),
    parts.sound,
    parts.ticks !== undefined && textElement('duration', parts.ticks),
    ...(parts.ties ?? []).map((type) => element('tie', { type })),
    parts.instrument !== undefined && element('instrument', { id: parts.instrument }),
    textElement('voice', parts.voice),
    parts.graceType !== undefined && textElement('type', parts.graceType),
    ...durationChildren(parts.duration),
    parts.hasStem === false && textElement('stem', 'none'),
    parts.notehead,
    textElement('staff', parts.staff),
    parts.notations,
    parts.lyric,
    parts.play,
  ]);
}

/** insertRest: a rest of `duration` (a whole-measure rest when it is undefined). */
export function restElement(ticks: number, duration: Duration | undefined, voice: number, staff: number, notations?: XmlNode): XmlNode {
  const sound = element('rest', { measure: duration === undefined ? 'yes' : undefined });
  return noteElement({ isChord: false, sound, ticks, voice, duration, staff, notations });
}

/** `<backup>` / `<forward>`: moves the time cursor from `from` to `to` (ticks in the measure). */
export function cursorMove(from: number, to: number): XmlNode | undefined {
  if (to === from) {
    return undefined;
  }
  return element(to > from ? 'forward' : 'backup', {}, [textElement('duration', Math.abs(to - from))]);
}
