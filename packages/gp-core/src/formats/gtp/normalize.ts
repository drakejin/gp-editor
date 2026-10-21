// Port of TuxGuitar app.tuxguitar.io.gtp.GTPSongNormalizer and GTPVoiceJoiner (LGPL-2.1).
import {
  DEFAULT_PERCUSSION_BANK,
  DEFAULT_PERCUSSION_CHANNEL,
  durationTicks,
  measureTicks,
  NORMAL_TUPLET,
} from '../../model/defaults';
import type { Beat, Channel, Duration, Measure, MeasureHeader, NoteValue, Song, Track, Voice } from '../../model/song';

/**
 * GTPSongNormalizer: percussion channels get program 0 and the percussion bank, and channels routed
 * to GM channel 9 (MIDI channel 10) become percussion channels even if the file left their bank at 0.
 *
 * Our Channel has no GM-channel routing, so readers pass it in `gmChannels` (channel id → GM channel 1,
 * 0-based), as TuxGuitar's PARAMETER_GM_CHANNEL_1. Tracks follow their channel (TGTrack.isPercussion)
 * and percussion measures report key signature 0 (TGMeasure.getKeySignature).
 */
export function normalizeSong(song: Song, gmChannels?: ReadonlyMap<number, number>): Song {
  const channels = song.channels.map((channel) => normalizeChannel(channel, gmChannels?.get(channel.id)));
  const percussion = new Set(channels.filter((channel) => channel.isPercussion).map((channel) => channel.id));
  const tracks = song.tracks.map((track) => normalizeTrack(track, percussion.has(track.channelId)));
  return { ...song, channels, tracks };
}

function normalizeChannel(channel: Channel, gmChannel: number | undefined): Channel {
  const isPercussion =
    channel.isPercussion || channel.bank === DEFAULT_PERCUSSION_BANK || gmChannel === DEFAULT_PERCUSSION_CHANNEL;
  return isPercussion ? { ...channel, program: 0, bank: DEFAULT_PERCUSSION_BANK, isPercussion } : channel;
}

function normalizeTrack(track: Track, isPercussion: boolean): Track {
  if (!isPercussion) {
    return track.isPercussion ? { ...track, isPercussion } : track;
  }
  const measures = track.measures.map((measure) => (measure.keySignature === 0 ? measure : { ...measure, keySignature: 0 }));
  return { ...track, isPercussion, measures };
}

// ---------------------------------------------------------------- GTPVoiceJoiner

/**
 * GTPVoiceJoiner: folds all voices of a measure into the first voice (for single-voice formats).
 * Beats are ordered by start, the notes of every voice move into voice 0, voice 0 durations are fixed
 * so beats neither overlap nor run past the measure, and beats that would be empty or overlapping
 * rests are dropped.
 *
 * TuxGuitar re-adds the other voices' notes each time it restarts after dropping a beat, which
 * duplicates them; here they are merged exactly once.
 */
export function joinVoices(measure: Measure, header: MeasureHeader): Measure {
  const measureEnd = header.start + measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  let beats = orderBeats(measure.beats).map(mergeIntoFirstVoice);
  for (;;) {
    const pass = joinPass(beats, measureEnd);
    if (pass.removeIndex === undefined) {
      return { ...measure, beats: pass.beats };
    }
    beats = pass.beats.filter((_, index) => index !== pass.removeIndex);
  }
}

/** Stable selection by start, as GTPVoiceJoiner.orderBeats. */
function orderBeats(beats: readonly Beat[]): readonly Beat[] {
  return [...beats].sort((a, b) => a.start - b.start);
}

function mergeIntoFirstVoice(beat: Beat): Beat {
  const [first, ...others] = beat.voices;
  if (first === undefined) {
    return beat;
  }
  const added = others.filter((voice) => !voice.isEmpty).flatMap((voice) => voice.notes);
  const merged: Voice = { ...first, notes: [...first.notes, ...added], isEmpty: first.isEmpty && added.length === 0 };
  return { ...beat, voices: [merged, ...others] };
}

interface JoinPass {
  readonly beats: readonly Beat[];
  /** Beat to drop before the next pass; undefined when the measure is done. */
  readonly removeIndex?: number;
}

function joinPass(input: readonly Beat[], measureEnd: number): JoinPass {
  const beats = [...input];
  let previousIndex: number | undefined;
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const voice = beat?.voices[0];
    if (beat === undefined || voice === undefined || voice.isEmpty) {
      return { beats, removeIndex: i };
    }
    const previous = previousIndex === undefined ? undefined : beats[previousIndex];
    if (previous !== undefined && previousIndex !== undefined) {
      const fitting = longestVoiceDuration(previous, beat.start);
      if (fitting === undefined && voice.notes.length === 0) {
        return { beats, removeIndex: i };
      }
      beats[previousIndex] = withFirstDuration(previous, fitting ?? durationFromTicks(beat.start - previous.start));
    }
    if (longestVoiceDuration(beat, measureEnd) === undefined) {
      if (voice.notes.length === 0) {
        return { beats, removeIndex: i };
      }
      beats[i] = withFirstDuration(beat, durationFromTicks(measureEnd - beat.start));
    }
    previousIndex = i;
  }
  return { beats };
}

/** Longest duration among the beat's non-empty voices that still ends by `end`. */
function longestVoiceDuration(beat: Beat, end: number): Duration | undefined {
  let best: Duration | undefined;
  for (const voice of beat.voices) {
    const length = durationTicks(voice.duration);
    const fits = !voice.isEmpty && beat.start + length <= end;
    if (fits && (best === undefined || length > durationTicks(best))) {
      best = voice.duration;
    }
  }
  return best;
}

function withFirstDuration(beat: Beat, duration: Duration): Beat {
  const [first, ...others] = beat.voices;
  return first === undefined ? beat : { ...beat, voices: [{ ...first, duration }, ...others] };
}

const PLAIN_VALUES: readonly NoteValue[] = [1, 2, 4, 8, 16, 32, 64];

/** TGDuration.getShortestDuration */
const SHORTEST_DURATION: Duration = {
  value: 64,
  dotted: false,
  doubleDotted: false,
  tuplet: { enters: 7, times: 4 },
};

/**
 * TGDuration.fromTime: the longest plain duration that fits in `ticks`, else the shortest duration.
 * (TuxGuitar first looks `ticks` up in a map keyed by "precise" durations, whose smallest key is
 * 110880; tick distances inside a measure never reach it, so that lookup is left out.)
 */
function durationFromTicks(ticks: number): Duration {
  for (const value of PLAIN_VALUES) {
    const duration: Duration = { value, dotted: false, doubleDotted: false, tuplet: NORMAL_TUPLET };
    if (ticks >= durationTicks(duration)) {
      return duration;
    }
  }
  return SHORTEST_DURATION;
}
