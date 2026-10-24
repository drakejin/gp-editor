import { type MidiOptions, type Song, renderMidi } from '@gp-editor/core';
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
 * written; one file, or one per playing track with that track alone.
 */

/** One file to render: its name, the track it holds alone (one file per track), and renderMidi's options. */
export interface AudioExportFile {
  readonly name: string;
  readonly trackIndex?: number;
  readonly midiOptions: MidiOptions;
}

/** A rendered file: its MIDI (base64) and the song's length in seconds (the native side adds the tail). */
export interface RenderedAudioFile {
  readonly midi: string;
  readonly seconds: number;
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

export function renderAudioFile(song: Song, file: AudioExportFile): RenderedAudioFile {
  const render = renderMidi(song, file.midiOptions);
  return { midi: bytesToBase64(render.bytes), seconds: render.durationSeconds };
}

/** The length of what is exported, before the tail (a render of the song: the panel keeps it while only the format changes). */
export function audioExportSeconds(song: Song, range: AudioRange, loop: LoopRange | undefined): number {
  return renderMidi(song, rangeOptions(resolveAudioRange(range, loop))).durationSeconds;
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
