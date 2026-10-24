// Port of TuxGuitar TGTrackManager.isAnyTiedTo and MusicXMLWriter#writeBeats' previousNotesOnAllStrings (LGPL-2.1): what follows each note.
import { type DynamicName, dynamicOf } from '../../formats/common/velocity';
import type { Beat, Note, Ottava, Track, Voice } from '../../model/song';

/** One voice of one beat that is not empty (a rest or notes). */
export interface VoiceEvent {
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly voiceIndex: number;
  readonly beat: Beat;
  readonly voice: Voice;
}

/** How the notes of a track connect: across beats and bar lines, voice by voice. */
export interface TrackFlow {
  /** The note on the same string in the voice's next event (a rest in between breaks it), by noteKey. */
  readonly next: ReadonlyMap<string, Note>;
  /** The note on the same string in the voice's previous event, by noteKey. */
  readonly previous: ReadonlyMap<string, Note>;
  /** Events (eventKey) where the track's dynamic changes, with the new dynamic; it starts at forte. */
  readonly dynamics: ReadonlyMap<string, DynamicName>;
  /** Events (eventKey) where palm muting starts in their voice. */
  readonly palmMuteStarts: ReadonlySet<string>;
  /** Beats (beatKey) where an octave sign starts and where it ends (its last beat), with the sign. */
  readonly ottavaStarts: ReadonlyMap<string, Ottava>;
  readonly ottavaStops: ReadonlyMap<string, Ottava>;
}

/** The dynamic of an unmarked note (TGVelocities.DEFAULT). */
const START_DYNAMIC: DynamicName = 'f';

export function beatKey(measureIndex: number, beatIndex: number): string {
  return `${measureIndex}/${beatIndex}`;
}

export function eventKey(measureIndex: number, beatIndex: number, voiceIndex: number): string {
  return `${measureIndex}/${beatIndex}/${voiceIndex}`;
}

/** A voice holds one note per string, so the event and the string name a note. */
export function noteKey(event: Pick<VoiceEvent, 'measureIndex' | 'beatIndex' | 'voiceIndex'>, string: number): string {
  return `${eventKey(event.measureIndex, event.beatIndex, event.voiceIndex)}/${string}`;
}

/** The track's events in time order: measure by measure, beat by beat, voice by voice. */
export function voiceEventsOf(track: Track): readonly VoiceEvent[] {
  return track.measures.flatMap((measure, measureIndex) =>
    measure.beats.flatMap((beat, beatIndex) =>
      beat.voices.flatMap((voice, voiceIndex): VoiceEvent[] => (voice.isEmpty ? [] : [{ measureIndex, beatIndex, voiceIndex, beat, voice }])),
    ),
  );
}

function linkVoice(events: readonly VoiceEvent[], next: Map<string, Note>, previous: Map<string, Note>): void {
  events.forEach((event, index) => {
    const following = events[index + 1];
    if (following === undefined) {
      return;
    }
    for (const note of event.voice.notes) {
      const after = following.voice.notes.find((candidate) => candidate.string === note.string);
      if (after !== undefined) {
        next.set(noteKey(event, note.string), after);
        previous.set(noteKey(following, after.string), note);
      }
    }
  });
}

function dynamicChanges(events: readonly VoiceEvent[]): ReadonlyMap<string, DynamicName> {
  const changes = new Map<string, DynamicName>();
  let current = START_DYNAMIC;
  for (const event of events) {
    const first = event.voice.notes[0];
    const dynamic = first === undefined ? current : dynamicOf(first.velocity);
    if (dynamic !== current) {
      changes.set(eventKey(event.measureIndex, event.beatIndex, event.voiceIndex), dynamic);
      current = dynamic;
    }
  }
  return changes;
}

function isPalmMuted(event: VoiceEvent | undefined): boolean {
  return event?.voice.notes.some((note) => note.effect.palmMute) ?? false;
}

function palmMuteStarts(voiceEvents: readonly VoiceEvent[]): readonly string[] {
  return voiceEvents.flatMap((event, index) =>
    isPalmMuted(event) && !isPalmMuted(voiceEvents[index - 1]) ? [eventKey(event.measureIndex, event.beatIndex, event.voiceIndex)] : [],
  );
}

interface PlayedBeat {
  readonly key: string;
  readonly ottava: Ottava | undefined;
}

/** Runs of beats under one octave sign, across bar lines: the key of each run's first and last beat. */
function ottavaRuns(track: Track): Pick<TrackFlow, 'ottavaStarts' | 'ottavaStops'> {
  const beats = track.measures.flatMap((measure, measureIndex) =>
    measure.beats.flatMap((beat, beatIndex): PlayedBeat[] => (beat.voices.every((voice) => voice.isEmpty) ? [] : [{ key: beatKey(measureIndex, beatIndex), ottava: beat.ottava }])),
  );
  const starts = new Map<string, Ottava>();
  const stops = new Map<string, Ottava>();
  beats.forEach(({ key, ottava }, index) => {
    if (ottava === undefined) {
      return;
    }
    if (beats[index - 1]?.ottava !== ottava) {
      starts.set(key, ottava);
    }
    if (beats[index + 1]?.ottava !== ottava) {
      stops.set(key, ottava);
    }
  });
  return { ottavaStarts: starts, ottavaStops: stops };
}

export function buildTrackFlow(track: Track): TrackFlow {
  const events = voiceEventsOf(track);
  const voiceIndexes = [...new Set(events.map((event) => event.voiceIndex))];
  const next = new Map<string, Note>();
  const previous = new Map<string, Note>();
  const starts = new Set<string>();
  for (const voiceIndex of voiceIndexes) {
    const voiceEvents = events.filter((event) => event.voiceIndex === voiceIndex);
    linkVoice(voiceEvents, next, previous);
    palmMuteStarts(voiceEvents).forEach((key) => starts.add(key));
  }
  return { next, previous, dynamics: dynamicChanges(events), palmMuteStarts: starts, ...ottavaRuns(track) };
}
