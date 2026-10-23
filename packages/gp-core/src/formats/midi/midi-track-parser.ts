// Port of TuxGuitar app.tuxguitar.io.midi.MidiSongReader (LGPL-2.1): each track's events → beats, plus channels, names and pitch ranges.
import { GpFormatError } from '../../errors';
import { type Charset, decodeText } from '../../io/text';
import { CONTROLLER } from '../../midi/midi-events';
import { QUARTER_TIME } from '../../model/song';
import { type FillContext, type FillState, type RawMeasures, fillUntil } from './midi-quantize';
import { META_TYPE, MIDI_COMMAND, type MidiEvent, type MidiTrackEvents, type ShortMessage, isNoteOff } from './midi-sequence';

/** Highest MIDI data value (key, velocity, program, controller value); a corrupt file may hold more. */
const MAX_MIDI_VALUE = 127;

/** A song track while the file is read (TGTrack before MidiSongReader.checkAll). */
export interface RawTrack {
  /** 1-based, in the order tracks are found. */
  readonly number: number;
  name: string | undefined;
  readonly measures: RawMeasures;
}

/** TempChannel: a MIDI channel's last program, volume and balance, and the tracks that play notes on it. */
export interface TempChannel {
  readonly channel: number;
  program: number;
  volume: number;
  balance: number;
  readonly tracks: Set<number>;
}

/** TrackTuningHelper's range: the lowest and highest pitch a track plays. */
export interface PitchRange {
  readonly min: number;
  readonly max: number;
}

export interface ParsedTracks {
  /** The first track's name (MidiSongReader's sequenceName). */
  readonly songName: string;
  readonly tracks: readonly RawTrack[];
  readonly tempChannels: readonly TempChannel[];
  /** By track number; none for a track without notes. */
  readonly ranges: ReadonlyMap<number, PitchRange>;
}

export interface ParseContext extends FillContext {
  /** File tick → song tick. */
  readonly toTick: (fileTick: number) => number;
  readonly charset: Charset;
  /** Most song tracks a file may make. */
  readonly maxTracks: number;
}

/** MidiSongReader's fields while the tracks are read. */
interface ParserState {
  songName: string;
  readonly tracks: RawTrack[];
  readonly tempChannels: TempChannel[];
  readonly ranges: Map<number, PitchRange>;
}

/** The track being read: its index in the file, its song track number and reading position. */
interface TrackCursor {
  readonly index: number;
  readonly number: number;
  readonly fill: FillState;
}

/** getTrack: the song track with this number, made when first needed. */
function trackOf(state: ParserState, context: ParseContext, number: number): RawTrack {
  const existing = state.tracks.find((track) => track.number === number);
  if (existing !== undefined) {
    return existing;
  }
  if (state.tracks.length >= context.maxTracks) {
    throw new GpFormatError(`MIDI file has more than ${context.maxTracks} tracks`);
  }
  const track: RawTrack = { number, name: undefined, measures: [] };
  state.tracks.push(track);
  return track;
}

/** getTempChannel: a MIDI channel's state, made when first used (program 0, volume 127, centred). */
function tempChannelOf(state: ParserState, channel: number): TempChannel {
  const existing = state.tempChannels.find((tempChannel) => tempChannel.channel === channel);
  if (existing !== undefined) {
    return existing;
  }
  const tempChannel: TempChannel = { channel, program: 0, volume: 127, balance: 64, tracks: new Set() };
  state.tempChannels.push(tempChannel);
  return tempChannel;
}

/** createTempNotesBefore, on the cursor's track. */
function fillBefore(state: ParserState, context: ParseContext, cursor: TrackCursor, tick: number): void {
  if (tick !== cursor.fill.lastBeatEnd) {
    fillUntil(context, trackOf(state, context, cursor.number).measures, cursor.fill, tick);
  }
}

function widenRange(state: ParserState, number: number, pitch: number): void {
  const range = state.ranges.get(number);
  state.ranges.set(number, { min: Math.min(range?.min ?? pitch, pitch), max: Math.max(range?.max ?? pitch, pitch) });
}

/**
 * parseNoteOn: the time before it is written, then the note sounds until its note-off. A key struck again while it
 * sounds just splits it (several note-ons without a note-off are seen in files). Key 0 is ignored, as in TuxGuitar,
 * and so is a key the transposition moves off the MIDI range. The note-on's velocity is kept (TuxGuitar writes 64).
 */
function parseNoteOn(state: ParserState, context: ParseContext, cursor: TrackCursor, tick: number, event: ShortMessage): void {
  if (event.data2 === 0) {
    parseNoteOff(state, context, cursor, tick, event);
    return;
  }
  if (event.data1 <= 0) {
    return;
  }
  fillBefore(state, context, cursor, tick);
  tempChannelOf(state, event.channel).tracks.add(cursor.number);
  const pitch = event.data1 + context.settings.transpose;
  if (pitch < 0 || pitch > MAX_MIDI_VALUE) {
    return;
  }
  widenRange(state, cursor.number, pitch);
  if (!cursor.fill.tempNotes.some((tempNote) => tempNote.pitch === pitch)) {
    cursor.fill.tempNotes.push({ channel: event.channel, pitch, velocity: Math.min(MAX_MIDI_VALUE, event.data2), shallBeTied: false });
  }
}

/** parseNoteOff: the note's last beat is written up to here and it stops sounding. */
function parseNoteOff(state: ParserState, context: ParseContext, cursor: TrackCursor, tick: number, event: ShortMessage): void {
  const pitch = event.data1 + context.settings.transpose;
  const index = cursor.fill.tempNotes.findIndex((tempNote) => tempNote.channel === event.channel && tempNote.pitch === pitch);
  if (index >= 0) {
    fillBefore(state, context, cursor, tick);
    cursor.fill.tempNotes.splice(index, 1);
  }
}

/** parseProgramChange / parseControlChange (volume and balance): the channel's last values win; out-of-range ones are ignored or capped. */
function parseChannelSetting(state: ParserState, event: ShortMessage): void {
  const tempChannel = tempChannelOf(state, event.channel);
  const value = Math.min(MAX_MIDI_VALUE, event.data2);
  if (event.command === MIDI_COMMAND.PROGRAM_CHANGE) {
    tempChannel.program = event.data1 <= MAX_MIDI_VALUE ? event.data1 : tempChannel.program;
  } else if (event.data1 === CONTROLLER.VOLUME) {
    tempChannel.volume = value;
  } else if (event.data1 === CONTROLLER.BALANCE) {
    tempChannel.balance = value;
  }
}

/** parseTrackName: the first track's name names the song (format 0, or a format 1 file's conductor track); others name their track. */
function parseTrackName(state: ParserState, context: ParseContext, cursor: TrackCursor, data: Uint8Array): void {
  const name = decodeText(data, context.charset);
  if (cursor.index === 0) {
    state.songName = name;
  } else {
    trackOf(state, context, cursor.number).name = name;
  }
}

function parseMessage(state: ParserState, context: ParseContext, cursor: TrackCursor, event: MidiEvent): void {
  if (event.kind === 'meta') {
    if (event.type === META_TYPE.TRACK_NAME) {
      parseTrackName(state, context, cursor, event.data);
    }
    return;
  }
  const tick = context.toTick(event.tick);
  if (event.command === MIDI_COMMAND.NOTE_ON) {
    parseNoteOn(state, context, cursor, tick, event);
  } else if (event.command === MIDI_COMMAND.NOTE_OFF) {
    parseNoteOff(state, context, cursor, tick, event);
  } else if (event.command === MIDI_COMMAND.PROGRAM_CHANGE || event.command === MIDI_COMMAND.CONTROL_CHANGE) {
    parseChannelSetting(state, event);
  }
}

/** parseEvents: the note-offs of a tick first, so a key struck again on the tick it is released is not cut short. */
function parseTickEvents(state: ParserState, context: ParseContext, cursor: TrackCursor, events: readonly MidiEvent[]): void {
  const offs = events.filter(isNoteOff);
  const others = events.filter((event) => !isNoteOff(event));
  for (const event of [...offs, ...others]) {
    parseMessage(state, context, cursor, event);
  }
}

/** One MTrk: its events tick by tick; notes still sounding at its end end there (TuxGuitar drops them). */
function parseTrack(state: ParserState, context: ParseContext, events: MidiTrackEvents, index: number): void {
  const cursor: TrackCursor = { index, number: state.tracks.length + 1, fill: { lastBeatEnd: QUARTER_TIME, tempNotes: [] } };
  let tickEvents: MidiEvent[] = [];
  for (const event of events) {
    if (tickEvents[0] !== undefined && event.tick > tickEvents[0].tick) {
      parseTickEvents(state, context, cursor, tickEvents);
      tickEvents = [];
    }
    tickEvents.push(event);
  }
  parseTickEvents(state, context, cursor, tickEvents);
  const last = events[events.length - 1];
  if (cursor.fill.tempNotes.length > 0 && last !== undefined) {
    fillBefore(state, context, cursor, context.toTick(last.tick));
  }
}

/** Every track of the file, in order: the beats, the MIDI channels and the song name. */
export function parseTracks(tracks: readonly MidiTrackEvents[], context: ParseContext): ParsedTracks {
  const state: ParserState = { songName: '', tracks: [], tempChannels: [], ranges: new Map() };
  tracks.forEach((events, index) => parseTrack(state, context, events, index));
  return state;
}
