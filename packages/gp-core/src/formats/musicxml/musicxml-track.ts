// A MusicXML part as a track and its channel (no TuxGuitar reader exists; mirrors MusicXMLWriter#writeTrack / #writePartList).
import { neckFrets } from '../../edit/string-placement';
import { normalizeShortName } from '../../edit/track-properties';
import { DEFAULT_CHANNEL, DEFAULT_PERCUSSION_BANK, RED, STANDARD_BASS_TUNING, STANDARD_TUNING } from '../../model/defaults';
import type { Channel, Lyrics, Measure, MeasureHeader, Ottava, Track } from '../../model/song';
import { createChannelName, isGmBassProgram } from '../common/channels';
import { DEFAULT_VELOCITY } from '../common/velocity';
import { buildBeats } from './musicxml-beats';
import type { PartMeasure } from './musicxml-measures';
import type { RawNote } from './musicxml-note';
import { measureOttavas } from './musicxml-octave-shifts';
import type { PartInfo, PartInstrument } from './musicxml-part-list';
import type { Neck, PlacedNote } from './musicxml-placement';
import { type PartLayout, readStaffNotes, resolveLayout, toModelClef } from './musicxml-staves';
import { measureVoices, resolveVoiceIndexes } from './musicxml-voices';

/** A part with what the part-list says of it and its measures read. */
export interface PartSource {
  readonly info: PartInfo;
  readonly measures: readonly PartMeasure[];
}

export interface BuiltTrack {
  readonly track: Track;
  readonly channel: Channel;
}

const PERCUSSION_MIDI_CHANNEL = 10;
const PERCUSSION_STRING_COUNT = 6;
const BASS_PROGRAM = 33;
/** Guitar Pro tracks hold two voices at least (GP3–GP5). */
const MIN_VOICES = 2;
const BASS_NAME = /bass/i;

function isPercussionPart(info: PartInfo, layout: PartLayout): boolean {
  return layout.clef === 'percussion' || info.instruments.some((instrument) => instrument.midiChannel === PERCUSSION_MIDI_CHANNEL || instrument.unpitchedKey !== undefined);
}

function buildChannel(info: PartInfo, id: number, isPercussion: boolean, isBass: boolean, existing: readonly Channel[]): Channel {
  const instrument: PartInstrument | undefined = info.instruments[0];
  const program = isPercussion ? 0 : (instrument?.program ?? (isBass ? BASS_PROGRAM : DEFAULT_CHANNEL.program));
  return {
    ...DEFAULT_CHANNEL,
    id,
    name: createChannelName(existing, program, isPercussion),
    program,
    bank: isPercussion ? DEFAULT_PERCUSSION_BANK : (instrument?.bank ?? 0),
    volume: instrument?.volume ?? DEFAULT_CHANNEL.volume,
    balance: instrument?.balance ?? DEFAULT_CHANNEL.balance,
    isPercussion,
  };
}

/** Open strings, string 1 first: the tab staff's tuning, else drums' six silent strings, a bass's or a guitar's standard tuning. */
function resolveTuning(layout: PartLayout, isPercussion: boolean, isBass: boolean): readonly number[] {
  if (layout.tuning !== undefined) {
    return [...layout.tuning.lowestFirst].reverse();
  }
  if (isPercussion) {
    return Array.from({ length: PERCUSSION_STRING_COUNT }, () => 0);
  }
  return isBass ? STANDARD_BASS_TUNING : STANDARD_TUNING;
}

/** The velocity of a note: its own dynamics, else the last dynamic marked before it in the part, else forte. */
function velocityLookup(measures: readonly PartMeasure[]): (measureIndex: number) => (note: RawNote) => number {
  const marks = measures.flatMap((measure, measureIndex) => [...measure.dynamics].sort((a, b) => a.tick - b.tick).map((mark) => ({ measureIndex, ...mark })));
  return (measureIndex) => (note) => {
    if (note.velocity !== undefined) {
      return note.velocity;
    }
    const before = marks.filter((mark) => mark.measureIndex < measureIndex || (mark.measureIndex === measureIndex && mark.tick <= note.tick));
    return before[before.length - 1]?.value ?? DEFAULT_VELOCITY;
  };
}

/** One syllable per beat with notes, from the first measure with a lyric (Guitar Pro's lyrics, TGLyric). */
function buildLyrics(measures: readonly Measure[], headers: readonly MeasureHeader[], notes: readonly (readonly RawNote[])[]): Lyrics | undefined {
  const syllables = measures.map((measure, index) => {
    const start = headers[index]?.start ?? 0;
    return measure.beats
      .filter((beat) => beat.voices.some((voice) => voice.notes.length > 0))
      .map((beat) => notes[index]?.find((note) => note.tick === beat.start - start && note.lyric !== undefined && note.lyric !== '')?.lyric ?? '');
  });
  const first = syllables.findIndex((measure) => measure.some((syllable) => syllable !== ''));
  if (first < 0) {
    return undefined;
  }
  return { from: first + 1, text: syllables.slice(first).flat().join(' ').trimEnd() };
}

interface MeasureBuild {
  readonly measures: readonly Measure[];
  readonly notes: readonly (readonly RawNote[])[];
}

function buildMeasures(source: PartSource, layout: PartLayout, headers: readonly MeasureHeader[], neck: Omit<Neck, 'velocityOf'>): MeasureBuild {
  const notes = headers.map((_, index) => {
    const measure = source.measures[index];
    return measure === undefined ? [] : readStaffNotes(measure, layout);
  });
  const indexes = resolveVoiceIndexes(notes.flat());
  const voiceCount = Math.max(MIN_VOICES, ...[...indexes.values()].map((index) => index + 1));
  const velocityOf = velocityLookup(source.measures);
  let previous: readonly (readonly PlacedNote[])[] = Array.from({ length: voiceCount }, () => []);
  let key = 0;
  let clef = toModelClef(layout.clef);
  let ottava: Ottava | undefined;
  const measures = headers.map((header, index): Measure => {
    const read = source.measures[index];
    key = read?.key ?? key;
    const staffClef = read === undefined ? undefined : [...layout.staves].map((staff) => read.clefs.get(staff)).find((value) => value !== undefined);
    clef = staffClef === undefined ? clef : toModelClef(staffClef);
    const voices = measureVoices(notes[index] ?? [], indexes, voiceCount);
    const ottavas = measureOttavas(read?.octaveShifts ?? [], layout.staves, ottava);
    ottava = ottavas.atEnd;
    const built = buildBeats({ header, voices, texts: read?.texts ?? [], previous, ottavaAt: ottavas.at }, { ...neck, velocityOf: velocityOf(index) });
    previous = built.previous;
    return { headerIndex: index, clef, keySignature: neck.isPercussion ? 0 : key, beats: built.beats };
  });
  return { measures, notes };
}

/** A part as a track (numbered `number`) with a channel of its own. */
export function buildPartTrack(source: PartSource, headers: readonly MeasureHeader[], number: number, channels: readonly Channel[]): BuiltTrack {
  const layout = resolveLayout(source.measures);
  const isPercussion = isPercussionPart(source.info, layout);
  const program = source.info.instruments[0]?.program;
  const isBass = !isPercussion && ((program !== undefined && isGmBassProgram(program)) || layout.clef === 'bass' || BASS_NAME.test(source.info.name));
  const tuning = resolveTuning(layout, isPercussion, isBass);
  const capo = isPercussion ? 0 : (layout.tuning?.capo ?? 0);
  const keys = new Map(source.info.instruments.flatMap((instrument) => (instrument.unpitchedKey === undefined ? [] : [[instrument.id, instrument.unpitchedKey] as const])));
  const neck = { tuning, capo, lastFret: neckFrets(capo), isPercussion, keyOf: (note: RawNote) => keys.get(note.instrumentId ?? '') ?? note.pitch };
  const { measures, notes } = buildMeasures(source, layout, headers, neck);
  const channel = buildChannel(source.info, number, isPercussion, isBass, channels);
  const lyrics = isPercussion ? undefined : buildLyrics(measures, headers, notes);
  const name = source.info.name === '' ? `Track ${number}` : source.info.name;
  const shortName = normalizeShortName(source.info.abbreviation, name);
  const track: Track = {
    number,
    name,
    ...(shortName === undefined ? {} : { shortName }),
    channelId: channel.id,
    strings: tuning.map((open, index) => ({ number: index + 1, tuning: open })),
    color: RED,
    offset: capo,
    isPercussion,
    solo: false,
    mute: false,
    ...(lyrics === undefined ? {} : { lyrics }),
    measures,
  };
  return { track, channel };
}
