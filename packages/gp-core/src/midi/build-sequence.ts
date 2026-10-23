// Port of TuxGuitar app.tuxguitar.player.base.MidiSequenceParser (LGPL-2.1): a song as MIDI events, track by track.
import { DEFAULT_PERCUSSION_BANK } from '../model/defaults';
import type { Channel, MeasureHeader, Song, Track } from '../model/song';
import { strokeOffsets, tripletFeelTiming } from './beat-timing';
import {
  CONTROLLER,
  controlChangeEvent,
  DEFAULT_BEND,
  pitchBendEvent,
  type SequenceEvent,
  toDataValue,
} from './midi-events';
import { buildNoteEvents } from './note-events';
import type { TrackContext } from './note-search';
import { type PlayedMeasure, playedTempo } from './playback-order';
import { usqFromTempo } from './timeline';

/** ADD_DEFAULT_CONTROLS: pitch-bend range of 12 semitones (RPN 0) on every channel. */
const PITCH_BEND_RANGE = 12;
const FULL_EXPRESSION = 127;

/** addDefaultMessages: the pitch-bend sensitivity RPN for each channel. */
function defaultControls(channels: readonly Channel[], tick: number): SequenceEvent[] {
  return channels.flatMap((channel) => [
    controlChangeEvent(channel.id, tick, CONTROLLER.RPN_MSB, 0),
    controlChangeEvent(channel.id, tick, CONTROLLER.RPN_LSB, 0),
    controlChangeEvent(channel.id, tick, CONTROLLER.DATA_ENTRY_MSB, PITCH_BEND_RANGE),
    controlChangeEvent(channel.id, tick, CONTROLLER.DATA_ENTRY_LSB, 0),
  ]);
}

function headerOf(headers: readonly MeasureHeader[], played: PlayedMeasure | undefined): MeasureHeader | undefined {
  return played === undefined ? undefined : headers[played.headerIndex];
}

/** Microseconds per quarter note a played measure sounds at (its pass's tempo scale applied). */
function playedUsq(headers: readonly MeasureHeader[], measure: PlayedMeasure | undefined): number | undefined {
  const header = headerOf(headers, measure);
  return header === undefined || measure === undefined ? undefined : usqFromTempo(playedTempo(header, measure));
}

/**
 * addTimeSignature / addTempo: a meta event wherever a played measure changes them. The first played measure's go at
 * `origin`, where the file starts (before that measure when a count-in plays first).
 */
function measureChanges(headers: readonly MeasureHeader[], played: readonly PlayedMeasure[], origin: number): SequenceEvent[] {
  return played.flatMap((measure, index): SequenceEvent[] => {
    const header = headerOf(headers, measure);
    if (header === undefined) {
      return [];
    }
    const previous = headerOf(headers, played[index - 1]);
    const tick = index === 0 ? origin : header.start + measure.move;
    const { numerator, denominator } = header.timeSignature;
    const isNewSignature =
      previous?.timeSignature.numerator !== numerator || previous.timeSignature.denominator !== denominator;
    const usq = usqFromTempo(playedTempo(header, measure));
    const isNewTempo = playedUsq(headers, played[index - 1]) !== usq;
    return [
      ...(isNewSignature ? [{ type: 'timeSignature' as const, tick, numerator, denominator }] : []),
      ...(isNewTempo ? [{ type: 'tempo' as const, tick, usq }] : []),
    ];
  });
}

/** The conductor track (TuxGuitar's info track): default controls, time signatures and tempos. */
export function buildConductorEvents(song: Song, played: readonly PlayedMeasure[], origin: number): SequenceEvent[] {
  return [...defaultControls(song.channels, origin), ...measureChanges(song.measureHeaders, played, origin)];
}

/**
 * makeTrackChannel: mixer, bank and program of the track's channel, and the track name. The bank select is left
 * out on percussion channels, whose drum kit the synthesizer picks from MIDI channel 9.
 */
function channelSetup(channel: Channel, track: Track, tick: number): SequenceEvent[] {
  const control = (controller: number, value: number): SequenceEvent =>
    controlChangeEvent(channel.id, tick, controller, value);
  const bank =
    channel.isPercussion || channel.bank === DEFAULT_PERCUSSION_BANK
      ? []
      : [control(CONTROLLER.BANK_SELECT, channel.bank)];
  return [
    control(CONTROLLER.VOLUME, channel.volume),
    control(CONTROLLER.BALANCE, channel.balance),
    control(CONTROLLER.CHORUS, channel.chorus),
    control(CONTROLLER.REVERB, channel.reverb),
    control(CONTROLLER.PHASER, channel.phaser),
    control(CONTROLLER.TREMOLO, channel.tremolo),
    control(CONTROLLER.EXPRESSION, FULL_EXPRESSION),
    ...bank,
    { type: 'programChange', tick, channelId: channel.id, program: toDataValue(channel.program) },
    { type: 'trackName', tick, name: track.name },
  ];
}

/** addBeats / addNotes for one played measure: every struck note of every beat and voice. */
function measureEvents(context: TrackContext, playedIndex: number): SequenceEvent[] {
  const played = context.played[playedIndex];
  const header = headerOf(context.headers, played);
  const beats = played === undefined ? undefined : context.track.measures[played.headerIndex]?.beats;
  if (played === undefined || header === undefined || beats === undefined) {
    return [];
  }
  const tempo = playedTempo(header, played);
  return beats.flatMap((beat, beatIndex) => {
    const strokes = strokeOffsets(beat, context.track.strings.length);
    return beat.voices.flatMap((voice, voiceIndex) => {
      const timing = tripletFeelTiming(beats, beatIndex, voiceIndex, header.tripletFeel);
      return voice.notes
        .filter((note) => !note.isTied)
        .flatMap((note) => {
          const placed = { note, voice, beat, header, tempo, move: played.move, playedIndex, beatIndex, voiceIndex };
          return buildNoteEvents(context, placed, timing, strokes[note.string - 1] ?? 0);
        });
    });
  });
}

/** addTrack: the channel setup, then the notes when the track is played. A track without channel stays silent. */
export function buildTrackEvents(
  context: Omit<TrackContext, 'channel'>,
  channel: Channel | undefined,
  isPlayed: boolean,
): SequenceEvent[] {
  if (channel === undefined) {
    return [];
  }
  const full: TrackContext = { ...context, channel };
  const setup = [
    pitchBendEvent({ channelId: channel.id, bendMode: false }, context.origin, DEFAULT_BEND),
    ...channelSetup(channel, context.track, context.origin),
  ];
  if (!isPlayed) {
    return setup;
  }
  return [...setup, ...context.played.flatMap((_, playedIndex) => measureEvents(full, playedIndex))];
}
