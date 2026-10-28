import { expect } from 'vitest';
import { durationTicks, measureTicks, roundTempo, toNoteAudio } from '../../src/model/defaults';
import { buildAudioTrack } from '../../src/audio-track/audio-track';
import type { AudioTrack, Measure, MeasureHeader, Note, NoteAudio, Song, Track } from '../../src/model/song';
import { assertNotationMarks } from './invariants-marks';

const DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32, 64];
const MAX_VELOCITY = 127;

/** One header's checks: its number, meter, tempo (two decimals) and start right after the previous header. */
function headerViolations(header: MeasureHeader, index: number, previous: MeasureHeader | undefined): string[] {
  const where = `header ${index}`;
  const { numerator, denominator } = header.timeSignature;
  const problems: string[] = [];
  if (!Object.is(header.number, index + 1)) problems.push(`${where}: number ${header.number}`);
  if (!DENOMINATORS.includes(denominator)) problems.push(`${where}: denominator ${denominator}`);
  if (!(numerator > 0)) problems.push(`${where}: numerator ${numerator}`);
  if (!(header.tempo > 0)) problems.push(`${where}: tempo ${header.tempo}`);
  if (!Object.is(roundTempo(header.tempo), header.tempo)) problems.push(`${where}: tempo ${header.tempo} has more than two decimals`);
  if (previous !== undefined) {
    const expected = previous.start + measureTicks(previous.timeSignature.numerator, previous.timeSignature.denominator);
    if (!Object.is(header.start, expected)) problems.push(`${where}: start ${header.start}, expected ${expected}`);
  }
  return problems;
}

function noteViolations(note: Note, track: Track, where: string): string[] {
  const problems: string[] = [];
  if (!(note.string >= 1 && note.string <= track.strings.length)) problems.push(`${where}: string ${note.string}`);
  if (!(note.velocity >= 0 && note.velocity <= MAX_VELOCITY)) problems.push(`${where}: velocity ${note.velocity}`);
  if (!Object.is(note.effect.vibrato && note.effect.wideVibrato, false)) problems.push(`${where}: slight and wide vibrato`);
  return problems;
}

/** One measure's checks: its header index, beats from the header's start in order, voices with a length. */
function measureViolations(track: Track, measure: Measure, measureIndex: number, header: MeasureHeader | undefined): string[] {
  const where = `track ${track.number} measure ${measureIndex}`;
  if (header === undefined) {
    return [`${where}: no header`];
  }
  const problems: string[] = Object.is(measure.headerIndex, measureIndex) ? [] : [`${where}: headerIndex ${measure.headerIndex}`];
  let previousStart = -1;
  measure.beats.forEach((beat, beatIndex) => {
    const at = `${where} beat ${beatIndex}`;
    if (!(beat.start >= header.start && beat.start >= previousStart)) problems.push(`${at}: start ${beat.start} before ${Math.max(header.start, previousStart)}`);
    previousStart = beat.start;
    if (!(beat.voices.length > 0)) problems.push(`${at}: no voices`);
    for (const voice of beat.voices) {
      if (!(durationTicks(voice.duration) > 0)) problems.push(`${at}: duration ${JSON.stringify(voice.duration)}`);
      for (const note of voice.notes) {
        problems.push(...noteViolations(note, track, at));
      }
    }
  });
  return problems;
}

function trackViolations(song: Song, track: Track, trackIndex: number, channelIds: ReadonlySet<number>): string[] {
  const where = `track ${trackIndex}`;
  const problems: string[] = [];
  if (!Object.is(track.number, trackIndex + 1)) problems.push(`${where}: number ${track.number}`);
  if (!channelIds.has(track.channelId)) problems.push(`${where}: channel ${track.channelId} missing`);
  if (!(track.strings.length > 0)) problems.push(`${where}: no strings`);
  track.strings.forEach((guitarString, i) => {
    if (!Object.is(guitarString.number, i + 1)) problems.push(`${where} string ${i}: number ${guitarString.number}`);
    if (!(Number.isInteger(guitarString.tuning) && guitarString.tuning >= 0 && guitarString.tuning <= 127)) problems.push(`${where} string ${i}: tuning ${guitarString.tuning}`);
  });
  if (!Object.is(track.measures.length, song.measureHeaders.length)) problems.push(`${where}: ${track.measures.length} measures, ${song.measureHeaders.length} headers`);
  track.measures.forEach((measure, measureIndex) => problems.push(...measureViolations(track, measure, measureIndex, song.measureHeaders[measureIndex])));
  return problems;
}

/**
 * Structural checks every reader's output must pass, whatever the format.
 * Use in each reader's fixture sweep: `assertSongInvariants(readSong(bytes))`. Gathered first and checked once: one
 * expect per note made the sweeps over large files take seconds.
 */
export function assertSongInvariants(song: Song): void {
  const channelIds = new Set(song.channels.map((channel) => channel.id));
  const violations = [
    ...(song.measureHeaders.length > 0 ? [] : ['no measure headers']),
    ...(song.tracks.length > 0 ? [] : ['no tracks']),
    ...(song.audioTrack === undefined || song.audioTrack.assetId.trim() !== '' ? [] : ['audio track without an asset id']),
    ...song.measureHeaders.flatMap((header, index) => headerViolations(header, index, song.measureHeaders[index - 1])),
    ...song.tracks.flatMap((track, trackIndex) => trackViolations(song, track, trackIndex, channelIds)),
  ];
  expect(violations).toEqual([]);
  if (song.audioTrack !== undefined) {
    assertAudioTrackInvariants(song.audioTrack);
  }
  const audios: NoteAudio[] = song.tracks.flatMap((track) =>
    track.measures.flatMap((measure) => measure.beats.flatMap((beat) => beat.voices.flatMap((voice) => voice.notes.flatMap((note) => (note.audio === undefined ? [] : [note.audio]))))),
  );
  expect(audios.map(toNoteAudio)).toEqual(audios);
  assertNotationMarks(song);
}

/** An audio track is within its bounds (buildAudioTrack leaves it as it is). */
function assertAudioTrackInvariants(track: AudioTrack): void {
  expect(buildAudioTrack(track)).toEqual(track);
}
