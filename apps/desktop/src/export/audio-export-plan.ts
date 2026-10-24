import { type MidiOptions, type Song, renderMidi } from '@gp-editor/core';
import { type AudioPlayback, audioPlaybackOf, isAudioTrackAudible } from '../lib/audio-track';
import { bytesToBase64 } from '../lib/base64';
import { withoutExtension } from '../lib/file-name';
import { formatClock } from '../lib/song-time';
import { plural } from '../lib/wording';
import type { LoopRange } from '../state/practice';
import { type AudioExportOptions, type AudioRange, audioFormat, audioQualityText } from './audio-formats';
import { pngFilesText } from './png-export';

/**
 * What File ▸ Export Audio… renders: the song as playback plays it (gp-core's renderMidi — repeats unfolded, the
 * written tempo, mute and solo honoured; never the practice speed, a metronome or a count-in), or the loop's bars as
 * written; one file, or one per playing track with that track alone. A song whose audio track's file is loaded plays
 * at its pace, as playback does, and the whole mix has the audio under it (the files of one track each do not).
 */

/** One file to render: its name, the track it holds alone (one file per track), and renderMidi's options. */
export interface AudioExportFile {
  readonly name: string;
  readonly trackIndex?: number;
  readonly midiOptions: MidiOptions;
}

/** A rendered file: its MIDI (base64), the song's length in seconds (the native side adds the tail), the audio under it. */
export interface RenderedAudioFile {
  readonly midi: string;
  readonly seconds: number;
  /** The audio track's runs under the whole mix (GPAudioTrackPlayer's playback); absent without one. */
  readonly audio?: AudioPlayback;
}

/** A file the native side wrote. */
export interface WrittenAudioFile {
  readonly name: string;
  readonly seconds: number;
}

/** Characters a file name cannot hold on macOS (":" shows as "/" in Finder), and a leading dot (a hidden file). */
const UNSAFE_NAME = /[/:\\]/g;

/** Text safe in a file name: those characters as "-", no leading dots or spaces (GPAudioExport.m checks it again). */
function fileSafe(text: string): string {
  return text.replace(UNSAFE_NAME, '-').replace(/^[.\s]+/, '').trim();
}

/** The tracks playback plays: none muted, and only the solo ones when a track is solo. */
export function playedTrackIndexes(song: Song): readonly number[] {
  const hasSolo = song.tracks.some((track) => track.solo);
  return song.tracks.flatMap((track, index) => (!track.mute && (!hasSolo || track.solo) ? [index] : []));
}

/** The loop's bars when they are asked for and a loop is set; undefined for the whole song. */
export function resolveAudioRange(range: AudioRange, loop: LoopRange | undefined): LoopRange | undefined {
  return range === 'loop' ? loop : undefined;
}

function rangeOptions(loop: LoopRange | undefined): MidiOptions {
  return loop === undefined ? {} : { fromHeaderIndex: loop.fromMeasureIndex, toHeaderIndex: loop.toMeasureIndex };
}

/** renderMidi's options with the score following the audio track when it plays (its file loaded), as playback does. */
function audioOptions(song: Song, options: MidiOptions, isAudioLoaded: boolean): MidiOptions {
  return isAudioLoaded && song.audioTrack !== undefined ? { ...options, syncToAudioTrack: true } : options;
}

/** "Song", or "Song (bars 5–12)" / "Song (bar 5)" for the loop's bars; file-safe ("AC:DC" → "AC-DC"). */
function baseName(fileName: string, loop: LoopRange | undefined): string {
  const base = fileSafe(withoutExtension(fileName)) || 'Song';
  if (loop === undefined) {
    return base;
  }
  const from = loop.fromMeasureIndex + 1;
  const to = loop.toMeasureIndex + 1;
  return from === to ? `${base} (bar ${from})` : `${base} (bars ${from}–${to})`;
}

/** "1 Guitar": the track's number and its name, safe in a file name ("Track 2" when it has none). */
function trackPart(song: Song, trackIndex: number): string {
  const track = song.tracks[trackIndex];
  const number = track?.number ?? trackIndex + 1;
  const name = fileSafe(track?.name ?? '');
  return `${number} ${name === '' ? `Track ${number}` : name}`;
}

/** The files the export writes: one, or one per playing track (none when every track is muted). */
export function planAudioExport(song: Song, fileName: string, options: AudioExportOptions, loop: LoopRange | undefined): readonly AudioExportFile[] {
  const range = resolveAudioRange(options.range, loop);
  const base = baseName(fileName, range);
  const { extension } = audioFormat(options.formatId);
  if (!options.isPerTrack) {
    return playedTrackIndexes(song).length === 0 ? [] : [{ name: `${base}.${extension}`, midiOptions: rangeOptions(range) }];
  }
  return playedTrackIndexes(song).map((trackIndex) => ({
    name: `${base} - ${trackPart(song, trackIndex)}.${extension}`,
    trackIndex,
    midiOptions: { ...rangeOptions(range), trackIndexes: [trackIndex] },
  }));
}

/** A file's MIDI and length; the whole mix with the audio track under it when its file is loaded (`isAudioLoaded`). */
export function renderAudioFile(song: Song, file: AudioExportFile, isAudioLoaded = false): RenderedAudioFile {
  const isWholeMix = file.trackIndex === undefined;
  const render = renderMidi(song, isWholeMix ? audioOptions(song, file.midiOptions, isAudioLoaded) : file.midiOptions);
  const audio = isWholeMix ? audioPlaybackOf(song, render.audioRuns) : null;
  return { midi: bytesToBase64(render.bytes), seconds: render.durationSeconds, ...(audio === null ? {} : { audio }) };
}

/**
 * The length of what is exported, before the tail (a render of the song: the panel keeps it while only the format
 * changes); at the audio track's pace for the whole mix, at the written tempo for the files of one track each.
 */
export function audioExportSeconds(song: Song, range: AudioRange, loop: LoopRange | undefined, isAudioLoaded = false, isPerTrack = false): number {
  return renderMidi(song, audioOptions(song, rangeOptions(resolveAudioRange(range, loop)), isAudioLoaded && !isPerTrack)).durationSeconds;
}

const PLAYS_AS_PLAYBACK = 'The song as playback plays it: its sounds, volumes, effects and master mix, repeats unfolded';

/** The panel's first line: what is rendered, and at whose pace (the audio track's when its file is loaded, as playback). */
export function audioExportDescription(song: Song, isPerTrack: boolean, isAudioLoaded: boolean): string {
  if (song.audioTrack === undefined || !isAudioLoaded) {
    return `${PLAYS_AS_PLAYBACK}, at its own tempo.`;
  }
  if (isPerTrack) {
    return `${PLAYS_AS_PLAYBACK}; one file per track holds that track alone, at its own tempo, without the audio track.`;
  }
  return isAudioTrackAudible(song)
    ? `${PLAYS_AS_PLAYBACK}, at the audio track’s pace with its recording under it.`
    : `${PLAYS_AS_PLAYBACK}, at the audio track’s pace; the audio track is muted, so it is not heard.`;
}

/** The panel's line: quality · length (`audioExportSeconds`) → the file (or the files, into a folder). */
export function audioExportSummary(song: Song, fileName: string, options: AudioExportOptions, loop: LoopRange | undefined, seconds: number): string {
  const files = planAudioExport(song, fileName, options, loop);
  if (files.length === 0) {
    return 'Every track is muted: nothing to export.';
  }
  const names = files.map((file) => file.name);
  const destination = options.isPerTrack ? `${plural(files.length, 'file')}, one per track: ${pngFilesText(names)}, into a folder you choose` : names.join('');
  return `${audioQualityText(options)} · ${formatClock(seconds)} and a tail until the sound dies away → ${destination}`;
}

/** The hint after an export: what was saved, how long and in what quality, in which folder. */
export function audioSavedHint(written: readonly WrittenAudioFile[], folderName: string, options: AudioExportOptions): string {
  const quality = audioQualityText(options);
  const [first] = written;
  if (written.length === 1 && first !== undefined && !options.isPerTrack) {
    return `Saved ${first.name} (${formatClock(first.seconds)}, ${quality}) in “${folderName}”.`;
  }
  const names = written.map((file) => file.name);
  return `Saved ${plural(written.length, 'audio file')} (${quality}), one per track, in “${folderName}”: ${pngFilesText(names)}.`;
}
