// GPIF's id-referenced pools <Bars>, <Voices>, <Beats>, <Notes> and <Rhythms> (no TuxGuitar counterpart).
import { MAX_VOICES } from '../../formats/gpif/gpif-measure';
import { NORMAL_TUPLET, isSameTuplet } from '../../model/defaults';
import type { Duration, Grace, Measure, MeasureHeader, NoteValue, Song, Track, Tuplet, Voice } from '../../model/song';
import { type BeatCarrier, beatNode, beatNodeKey, graceBeatNode, graceBeatNodeKey, restBeatNode, voiceGraceOf } from './gpif-beats';
import { chordKeyOf } from './gpif-chords';
import { type NoteLinks, type VoiceItem, type WrittenBeat, noteKey, voiceItems } from './gpif-layout';
import { type NoteContext, type NoteTrackContext, graceNoteNode, graceNoteNodeKey, noteNode, noteNodeKey } from './gpif-notes';
import { clefNameOf, noteValueNameOf } from './gpif-units';
import { type XmlChild, type XmlNode, xmlElement, xmlText } from './xml-writer';

/** What the pools need to know about a track. */
export interface TrackPlan {
  readonly track: Track;
  readonly noteContext: NoteTrackContext;
  readonly chordIds: ReadonlyMap<string, number>;
  readonly links: NoteLinks;
  /** Where measure 1's voices start after the bar line (an anacrusis). */
  readonly leadingShift: number;
}

export interface GpifPools {
  /** Bar ids of every measure header, one per track. */
  readonly barIds: readonly (readonly number[])[];
  readonly bars: readonly XmlNode[];
  readonly voices: readonly XmlNode[];
  readonly beats: readonly XmlNode[];
  readonly notes: readonly XmlNode[];
  readonly rhythms: readonly XmlNode[];
}

/** Grace durations as TuxGuitar stores them: 3 = 16th, 2 = 32nd, anything else a 64th. */
const GRACE_NOTE_VALUES: Readonly<Record<number, NoteValue>> = { 3: 16, 2: 32 };
const SHORTEST_GRACE: NoteValue = 64;

function graceDurationOf(grace: Grace): Duration {
  const value = GRACE_NOTE_VALUES[grace.duration] ?? SHORTEST_GRACE;
  return { value, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET };
}

function dotCountOf(duration: Duration): number {
  if (duration.dotted) {
    return 1;
  }
  return duration.doubleDotted ? 2 : 0;
}

/** `<PrimaryTuplet>` / `<SecondaryTuplet>` of a real tuplet; nothing for none or 1:1. */
function tupletNode(name: string, tuplet: Tuplet | undefined): XmlChild {
  const isTuplet = tuplet !== undefined && tuplet.enters > 0 && tuplet.times > 0 && !isSameTuplet(tuplet, NORMAL_TUPLET);
  return isTuplet && xmlElement(name, [], { num: tuplet.enters, den: tuplet.times });
}

/** A rhythm: note value, dots, the tuplet and the tuplet inside it (GP7+'s secondary tuplet). */
function rhythmNode(id: number, duration: Duration): XmlNode {
  const count = dotCountOf(duration);
  return xmlElement(
    'Rhythm',
    [
      xmlText('NoteValue', noteValueNameOf(duration.value)),
      count > 0 && xmlElement('AugmentationDot', [], { count }),
      tupletNode('PrimaryTuplet', duration.tuplet),
      tupletNode('SecondaryTuplet', duration.innerTuplet),
    ],
    { id },
  );
}

function rhythmKeyOf(duration: Duration): string {
  const inner = duration.innerTuplet ?? NORMAL_TUPLET;
  return `${duration.value}/${dotCountOf(duration)}/${duration.tuplet.enters}:${duration.tuplet.times}/${inner.enters}:${inner.times}`;
}

/** One pool: its elements in id order, and the id of every element written under a key (equal keys, equal elements). */
interface Pool {
  readonly nodes: XmlNode[];
  readonly ids: Map<string, number>;
}

function emptyPool(): Pool {
  return { nodes: [], ids: new Map() };
}

/**
 * Collects the pools' elements and hands out their ids (each pool counts from 0). As Guitar Pro does, equal notes,
 * beats and rhythms are written once and shared by id; bars and voices are not. Shared elements are keyed by what
 * they are built from, so a repeated one is not built again.
 */
class PoolBuilder {
  readonly bars = emptyPool();
  readonly voices = emptyPool();
  readonly beats = emptyPool();
  readonly notes = emptyPool();
  readonly rhythms = emptyPool();

  add(pool: Pool, build: (id: number) => XmlNode): number {
    const id = pool.nodes.length;
    pool.nodes.push(build(id));
    return id;
  }

  addShared(pool: Pool, key: string, build: (id: number) => XmlNode): number {
    const existing = pool.ids.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.add(pool, build);
    pool.ids.set(key, id);
    return id;
  }

  rhythm(duration: Duration): number {
    return this.addShared(this.rhythms, rhythmKeyOf(duration), (id) => rhythmNode(id, duration));
  }
}

interface MeasureContext {
  readonly plan: TrackPlan;
  readonly trackIndex: number;
  readonly measureIndex: number;
  readonly keySignature: number;
}

function noteContextOf(context: MeasureContext, isTieOrigin: boolean, isHopoDestination: boolean): NoteContext {
  return { ...context.plan.noteContext, keySignature: context.keySignature, isTieOrigin, isHopoDestination };
}

function writeNotes(builder: PoolBuilder, item: WrittenBeat, voiceIndex: number, context: MeasureContext): readonly number[] {
  const { links } = context.plan;
  return item.voice.notes.map((note, noteIndex) => {
    const key = noteKey(context.measureIndex, item.beatIndex, voiceIndex, noteIndex);
    const isHopoDestination = links.hopoDestinations.has(key) || note.effect.grace?.transition === 'hammer';
    const noteContext = noteContextOf(context, links.tieOrigins.has(key), isHopoDestination);
    const poolKey = `${context.trackIndex} ${noteNodeKey(note, noteContext)}`;
    return builder.addShared(builder.notes, poolKey, (id) => noteNode(id, note, noteContext));
  });
}

function writeGraceBeat(builder: PoolBuilder, voice: Voice, context: MeasureContext): number | undefined {
  const grace = voiceGraceOf(voice);
  if (grace === undefined) {
    return undefined;
  }
  const noteContext = noteContextOf(context, false, false);
  const noteIds = voice.notes.flatMap((note) => {
    const noteGrace = note.effect.grace;
    if (noteGrace === undefined) {
      return [];
    }
    const poolKey = `${context.trackIndex} ${graceNoteNodeKey(note, noteGrace, noteContext)}`;
    return [builder.addShared(builder.notes, poolKey, (id) => graceNoteNode(id, note, noteGrace, noteContext))];
  });
  const rhythmId = builder.rhythm(graceDurationOf(grace));
  return builder.addShared(builder.beats, graceBeatNodeKey(grace, rhythmId, noteIds), (id) => graceBeatNode(id, grace, rhythmId, noteIds));
}

/** The first voice written for a beat carries its stroke, pick stroke, chord and text. */
function carrierOf(item: WrittenBeat, voiceIndex: number, plan: TrackPlan): BeatCarrier | undefined {
  const first = item.beat.voices.slice(0, MAX_VOICES).findIndex((voice) => !voice.isEmpty);
  if (first !== voiceIndex) {
    return undefined;
  }
  const chord = item.beat.chord;
  return { beat: item.beat, chordId: chord === undefined ? undefined : plan.chordIds.get(chordKeyOf(chord)) };
}

function writeItem(builder: PoolBuilder, item: VoiceItem, voiceIndex: number, context: MeasureContext): readonly number[] {
  if (item.kind === 'rest') {
    const restRhythm = builder.rhythm(item.duration);
    return [builder.addShared(builder.beats, `rest ${restRhythm}`, (id) => restBeatNode(id, restRhythm))];
  }
  const graceId = writeGraceBeat(builder, item.voice, context);
  const noteIds = writeNotes(builder, item, voiceIndex, context);
  const rhythmId = builder.rhythm(item.voice.duration);
  const carrier = carrierOf(item, voiceIndex, context.plan);
  const key = beatNodeKey(item.voice, rhythmId, noteIds, carrier);
  const beatId = builder.addShared(builder.beats, key, (id) => beatNode(id, item.voice, rhythmId, noteIds, carrier));
  return graceId === undefined ? [beatId] : [graceId, beatId];
}

function writeVoice(builder: PoolBuilder, measure: Measure, header: MeasureHeader, voiceIndex: number, context: MeasureContext): number {
  const shift = context.measureIndex === 0 ? context.plan.leadingShift : 0;
  const items = voiceItems(measure, header, voiceIndex, shift);
  if (items.length === 0) {
    return -1;
  }
  const beatIds = items.flatMap((item) => writeItem(builder, item, voiceIndex, context));
  return builder.add(builder.voices, (id) => xmlElement('Voice', [xmlText('Beats', beatIds.join(' '))], { id }));
}

function writeBar(builder: PoolBuilder, header: MeasureHeader, context: MeasureContext): number {
  const measure: Measure = context.plan.track.measures[context.measureIndex] ?? {
    headerIndex: context.measureIndex,
    clef: 'treble',
    keySignature: 0,
    beats: [],
  };
  const voiceIds = Array.from({ length: MAX_VOICES }, (_, voiceIndex) => writeVoice(builder, measure, header, voiceIndex, context));
  return builder.add(builder.bars, (id) =>
    xmlElement('Bar', [xmlText('Clef', clefNameOf(measure.clef)), xmlText('Voices', voiceIds.join(' '))], { id }),
  );
}

/** Every bar of every track (measure header by measure header), with its voices, beats, notes and rhythms. */
export function buildPools(song: Song, plans: readonly TrackPlan[], keySignatures: readonly number[]): GpifPools {
  const builder = new PoolBuilder();
  const barIds = song.measureHeaders.map((header, measureIndex) =>
    plans.map((plan, trackIndex) =>
      writeBar(builder, header, { plan, trackIndex, measureIndex, keySignature: keySignatures[measureIndex] ?? 0 }),
    ),
  );
  return {
    barIds,
    bars: builder.bars.nodes,
    voices: builder.voices.nodes,
    beats: builder.beats.nodes,
    notes: builder.notes.nodes,
    rhythms: builder.rhythms.nodes,
  };
}
