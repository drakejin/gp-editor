// Practice playback (not in TuxGuitar): a metronome clicking every beat of the played measures, and a bar of count-in.
import { DEFAULT_PERCUSSION_CHANNEL, measureTicks } from '../model/defaults';
import { type MeasureHeader, QUARTER_TIME, type TimeSignature } from '../model/song';
import type { ChannelRoute } from './channel-routes';
import { type NoteOutput, noteEvents, type SequenceEvent } from './midi-events';
import { type PlayedMeasure, playedTempo } from './playback-order';
import { secondsFromTicks } from './timeline';

/**
 * General MIDI percussion keys of the clicks (every GM drum kit has them): the first beat of a bar on the high wood
 * block (76), the other beats on the low wood block (77).
 */
export const CLICK_KEYS = { accent: 76, beat: 77 } as const;

/** How hard the clicks are struck. */
export interface ClickOptions {
  /** MIDI velocity 1–127 of a bar's first click; the other beats sound at BEAT_VELOCITY_RATIO of it. */
  readonly velocity: number;
}

/** The beats of a bar a metronome clicks: how many, and how long each lasts (song ticks). */
export interface MeterBeats {
  readonly count: number;
  readonly beatTicks: number;
}

const BEAT_VELOCITY_RATIO = 0.8;
/** A click's note length: a 64th note (shorter when the beat is). */
const CLICK_TICKS = QUARTER_TIME / 16;
/** Not a song channel: the clicks are routed on their own, to the GM percussion channel. */
const CLICK_CHANNEL_ID = 0;
const CLICK_OUTPUT: NoteOutput = { channelId: CLICK_CHANNEL_ID, bendMode: false };

/** The clicks' only route: MIDI channel 10 (9 from 0), where every GM synthesizer plays drums. */
export const CLICK_ROUTES: ReadonlyMap<number, ChannelRoute> = new Map([
  [CLICK_CHANNEL_ID, { channelId: CLICK_CHANNEL_ID, channel1: DEFAULT_PERCUSSION_CHANNEL, channel2: DEFAULT_PERCUSSION_CHANNEL }],
]);

/** Compound meters (6/8, 9/8, 12/8, 6/16 …: a multiple of three eighths or shorter) are counted in dotted beats. */
function isCompound({ numerator, denominator }: TimeSignature): boolean {
  return numerator > 3 && numerator % 3 === 0 && denominator >= 8;
}

/** The beats a bar of `timeSignature` is counted in: its beat value, or dotted beats in a compound meter (6/8 in two). */
export function meterBeats(timeSignature: TimeSignature): MeterBeats {
  const count = isCompound(timeSignature) ? timeSignature.numerator / 3 : timeSignature.numerator;
  return { count, beatTicks: measureTicks(timeSignature.numerator, timeSignature.denominator) / count };
}

/** One bar of clicks from `start` (sequence ticks). */
function barClicks(timeSignature: TimeSignature, start: number, options: ClickOptions): SequenceEvent[] {
  const { count, beatTicks } = meterBeats(timeSignature);
  const length = Math.min(CLICK_TICKS, beatTicks);
  const beatVelocity = Math.max(1, Math.round(options.velocity * BEAT_VELOCITY_RATIO));
  return Array.from({ length: count }, (_, beat) => {
    const isAccent = beat === 0;
    const key = isAccent ? CLICK_KEYS.accent : CLICK_KEYS.beat;
    return noteEvents(CLICK_OUTPUT, key, start + beat * beatTicks, length, isAccent ? options.velocity : beatVelocity);
  }).flat();
}

function trackName(name: string, tick: number): SequenceEvent {
  return { type: 'trackName', tick, name };
}

/** The metronome's track: a click on every beat of every played measure, so it follows repeats, loops and tempo. */
export function buildMetronomeEvents(
  headers: readonly MeasureHeader[],
  played: readonly PlayedMeasure[],
  origin: number,
  options: ClickOptions,
): SequenceEvent[] {
  const clicks = played.flatMap((measure) => {
    const header = headers[measure.headerIndex];
    return header === undefined ? [] : barClicks(header.timeSignature, header.start + measure.move, options);
  });
  return [trackName('Metronome', origin), ...clicks];
}

/** The count-in bar before the first played measure: its length (ticks) and how long it lasts (seconds). */
export interface CountIn {
  readonly ticks: number;
  readonly seconds: number;
  readonly timeSignature: TimeSignature;
}

/** One bar in the meter of the first played measure, at the tempo it is played at; undefined when nothing plays. */
export function resolveCountIn(headers: readonly MeasureHeader[], played: readonly PlayedMeasure[]): CountIn | undefined {
  const first = played[0];
  const header = first === undefined ? undefined : headers[first.headerIndex];
  if (first === undefined || header === undefined) {
    return undefined;
  }
  const { timeSignature } = header;
  const ticks = measureTicks(timeSignature.numerator, timeSignature.denominator);
  return { ticks, seconds: secondsFromTicks(ticks, playedTempo(header, first)), timeSignature };
}

/** The count-in's track: one bar of clicks from `origin`, where the file starts. */
export function buildCountInEvents(countIn: CountIn, origin: number, options: ClickOptions): SequenceEvent[] {
  return [trackName('Count-in', origin), ...barClicks(countIn.timeSignature, origin, options)];
}
