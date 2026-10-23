// Port of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLWriter#writeTrack's measure loop / #backToMeasureStart (LGPL-2.1).
import { NORMAL_TUPLET, durationTicks, measureTicks, plainDuration } from '../../model/defaults';
import type { MeasureHeader, Tuplet } from '../../model/song';
import { attributesElement, headerDirection, leftBarline, rightBarline } from './musicxml-attributes';
import { type EventMarks, type PartContext, type StaffSpec, eventElements, voiceNumber } from './musicxml-beat';
import type { VoiceEvent } from './musicxml-flow';
import { cursorMove, restElement } from './musicxml-note';
import { type XmlNode, element } from './xml-text';

const NOTATION_STAFF: StaffSpec = { staff: 1, isTab: false };
const TAB_STAFF: StaffSpec = { staff: 2, isTab: true };

function isTuplet(tuplet: Tuplet): boolean {
  return tuplet.enters !== tuplet.times;
}

function isSameTuplet(a: Tuplet, b: Tuplet): boolean {
  return a.enters === b.enters && a.times === b.times;
}

/**
 * Tuplet brackets of one voice in one measure: consecutive events in the same tuplet, a bracket closing once they fill
 * `times` notes of the first event's plain value (three eighth-note triplets fill two eighths). One-event groups get none.
 */
export function tupletBrackets(events: readonly VoiceEvent[]): ReadonlyMap<number, 'start' | 'stop'> {
  const brackets = new Map<number, 'start' | 'stop'>();
  let groupStart = -1;
  let filled = 0;
  let target = 0;
  events.forEach((event, index) => {
    const { tuplet } = event.voice.duration;
    const previous = events[index - 1]?.voice.duration.tuplet ?? NORMAL_TUPLET;
    if (!isTuplet(tuplet)) {
      groupStart = -1;
      return;
    }
    if (groupStart < 0 || !isSameTuplet(tuplet, previous)) {
      groupStart = index;
      filled = 0;
      target = durationTicks(plainDuration(event.voice.duration.value)) * tuplet.times;
    }
    filled += durationTicks(event.voice.duration);
    if (filled >= target) {
      if (index > groupStart) {
        brackets.set(groupStart, 'start');
        brackets.set(index, 'stop');
      }
      groupStart = -1;
    }
  });
  return brackets;
}

interface MeasureEvents {
  /** Events of each voice that has any, in time order. */
  readonly voices: readonly (readonly VoiceEvent[])[];
  /** The first voice that is not empty in each beat, and the first with notes, by beat index. */
  readonly firstVoice: ReadonlyMap<number, number>;
  readonly lyricVoice: ReadonlyMap<number, number>;
}

function measureEvents(context: PartContext, measureIndex: number): MeasureEvents {
  const measure = context.track.measures[measureIndex];
  const voiceCount = Math.max(0, ...(measure?.beats.map((beat) => beat.voices.length) ?? []));
  const voices = Array.from({ length: voiceCount }, (_, voiceIndex) =>
    (measure?.beats ?? []).flatMap((beat, beatIndex): VoiceEvent[] => {
      const voice = beat.voices[voiceIndex];
      return voice === undefined || voice.isEmpty ? [] : [{ measureIndex, beatIndex, voiceIndex, beat, voice }];
    }),
  ).filter((events) => events.length > 0);
  const firstVoice = new Map<number, number>();
  const lyricVoice = new Map<number, number>();
  (measure?.beats ?? []).forEach((beat, beatIndex) => {
    const first = beat.voices.findIndex((voice) => !voice.isEmpty);
    const sung = beat.voices.findIndex((voice) => voice.notes.length > 0);
    if (first >= 0) {
      firstVoice.set(beatIndex, first);
    }
    if (sung >= 0) {
      lyricVoice.set(beatIndex, sung);
    }
  });
  return { voices, firstVoice, lyricVoice };
}

interface StaffContent {
  readonly nodes: readonly XmlNode[];
  /** Where the time cursor ends, in ticks from the measure start. */
  readonly cursor: number;
  readonly reached: number;
}

/** Every voice of the measure on one staff, voice after voice, moving the cursor to each event (backup / forward). */
function staffContent(context: PartContext, header: MeasureHeader, events: MeasureEvents, staff: StaffSpec, keySignature: number): StaffContent {
  const nodes: XmlNode[] = [];
  let cursor = 0;
  let reached = 0;
  for (const voiceEvents of events.voices) {
    const brackets = tupletBrackets(voiceEvents);
    voiceEvents.forEach((event, index) => {
      const position = event.beat.start - header.start;
      const move = cursorMove(cursor, position);
      const marks: EventMarks = {
        tuplet: brackets.get(index),
        isFirstVoice: events.firstVoice.get(event.beatIndex) === event.voiceIndex,
        isLyricVoice: events.lyricVoice.get(event.beatIndex) === event.voiceIndex,
      };
      nodes.push(...(move === undefined ? [] : [move]), ...eventElements(context, event, staff, marks, keySignature));
      cursor = position + durationTicks(event.voice.duration);
      reached = Math.max(reached, cursor);
    });
  }
  return { nodes, cursor, reached };
}

function measureRest(length: number, staff: StaffSpec): StaffContent {
  return { nodes: [restElement(length, undefined, voiceNumber(0, staff), staff.staff)], cursor: length, reached: length };
}

/** One `<measure>` of a part: attributes, barlines, the header's direction, then the notation staff and the tab staff. */
export function buildMeasure(context: PartContext, headers: readonly MeasureHeader[], measureIndex: number): XmlNode {
  const header = headers[measureIndex];
  const measure = context.track.measures[measureIndex];
  if (header === undefined || measure === undefined) {
    throw new RangeError(`No measure ${measureIndex + 1} in track ${context.track.number}`);
  }
  const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  const events = measureEvents(context, measureIndex);
  const staves = context.track.isPercussion ? [NOTATION_STAFF] : [NOTATION_STAFF, TAB_STAFF];
  const content: XmlNode[] = [];
  let cursor = 0;
  let reached = 0;
  staves.forEach((staff, index) => {
    const written = events.voices.length === 0 ? measureRest(length, staff) : staffContent(context, header, events, staff, measure.keySignature);
    const back = index === 0 ? undefined : cursorMove(cursor, 0);
    content.push(...(back === undefined ? [] : [back]), ...written.nodes);
    cursor = written.cursor;
    reached = Math.max(reached, written.reached);
  });
  const toEnd = reached < length ? cursorMove(cursor, length) : undefined;
  return element('measure', { number: header.number }, [
    attributesElement(context.track, measureIndex, headers),
    leftBarline(header, headers[measureIndex - 1]),
    headerDirection(header, headers[measureIndex - 1]),
    ...content,
    toEnd,
    rightBarline(header, headers[measureIndex + 1]),
  ]);
}
