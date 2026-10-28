// i18n-exempt-file: JSON keys and English instrument names for MCP clients, never shown in the app
// The song and the window as JSON for an MCP client (1-based numbering, string 1 = highest): what is open, the song's
// information, tracks and the bars where its meter, tempo, key or sections change, the cursor, selection and playback.

import { GM_INSTRUMENT_NAMES, type Song, type StringAddress } from '@gp-editor/core';
import { pitchName } from '../lib/pitch';
import { selectionRange } from '../state/selection';
import { type EditorState, isEdited } from '../state/editor';
import { type WorkspaceState, tabTitle } from '../state/workspace';
import type { PlaybackView } from './app-host';
import type { JsonObject } from './json-rpc';

function trackJson(song: Song, trackIndex: number): JsonObject {
  const track = song.tracks[trackIndex];
  const channel = song.channels.find((candidate) => candidate.id === track?.channelId);
  if (track === undefined) {
    return {};
  }
  const isPercussion = track.isPercussion || channel?.isPercussion === true;
  const instrument = isPercussion ? 'Drums' : (GM_INSTRUMENT_NAMES[channel?.program ?? 0] ?? 'Unknown');
  const strings = [...track.strings].sort((a, b) => a.number - b.number).map((string) => ({ string: string.number, tuning: pitchName(string.tuning), midi: string.tuning }));
  return {
    track: trackIndex + 1,
    name: track.name,
    instrument,
    program: channel?.program ?? 0,
    isPercussion,
    ...(isPercussion ? {} : { strings, capo: track.offset }),
    bars: track.measures.length,
    ...(track.mute ? { mute: true } : {}),
    ...(track.solo ? { solo: true } : {}),
  };
}

/** Each bar where `valueOf` differs from the bar before (the first bar always). */
function changes<T>(song: Song, valueOf: (measureIndex: number) => T, key: string): readonly JsonObject[] {
  return song.measureHeaders.flatMap((_, index) => {
    const value = valueOf(index);
    return index > 0 && value === valueOf(index - 1) ? [] : [{ bar: index + 1, [key]: value }];
  });
}

/** The song: information, tracks, and where its meter, tempo, key and sections change. */
export function songJson(song: Song): JsonObject {
  const { info, measureHeaders } = song;
  const meter = (index: number) => {
    const signature = measureHeaders[index]?.timeSignature;
    return signature === undefined ? '' : `${signature.numerator}/${signature.denominator}`;
  };
  return {
    title: info.title,
    subtitle: info.subtitle,
    artist: info.artist,
    album: info.album,
    words: info.words,
    music: info.music,
    transcriber: info.transcriber,
    bars: measureHeaders.length,
    tracks: song.tracks.map((_, index) => trackJson(song, index)),
    timeSignatures: changes(song, meter, 'timeSignature'),
    tempos: changes(song, (index) => measureHeaders[index]?.tempo ?? 0, 'bpm'),
    keySignatures: changes(song, (index) => song.tracks[0]?.measures[index]?.keySignature ?? 0, 'keySignature'),
    sections: measureHeaders.flatMap((header) => (header.marker === undefined ? [] : [{ bar: header.number, title: header.marker.title }])),
  };
}

/** A cursor as the window shows it: track, bar, beat, voice and string, 1-based. */
export function cursorJson(cursor: StringAddress): JsonObject {
  return { track: cursor.trackIndex + 1, bar: cursor.measureIndex + 1, beat: cursor.beatIndex + 1, voice: cursor.voiceIndex + 1, string: cursor.string };
}

function selectionJson(editor: EditorState): JsonObject | undefined {
  const range = selectionRange(editor);
  return range === undefined
    ? undefined
    : { from: { bar: range.first.measureIndex + 1, beat: range.first.beatIndex + 1 }, to: { bar: range.last.measureIndex + 1, beat: range.last.beatIndex + 1 } };
}

/** Playback now: playing or not, the bar heard, the speed, the loop and the metronome. */
export function playbackJson(playback: PlaybackView, measureCount: number): JsonObject {
  const { practice, playing } = playback;
  const loop = practice.loop ?? { fromMeasureIndex: 0, toMeasureIndex: Math.max(0, measureCount - 1) };
  return {
    isPlaying: playback.isPlaying,
    ...(playback.isPlaying && playing !== undefined ? { playingBar: playing.measureIndex + 1 } : {}),
    speedPercent: Math.round(practice.tempoScale * 100),
    isLooping: practice.isLooping,
    ...(practice.isLooping ? { loop: { fromBar: loop.fromMeasureIndex + 1, toBar: loop.toMeasureIndex + 1 } } : {}),
    metronome: practice.isMetronomeOn,
    countIn: practice.isCountInOn,
  };
}

function documentJson(editor: EditorState): JsonObject | undefined {
  const { document } = editor;
  if (document === undefined) {
    return undefined;
  }
  const selection = selectionJson(editor);
  return {
    title: tabTitle(document),
    fileName: document.fileName,
    path: document.path === '' ? null : document.path,
    isEdited: isEdited(editor),
    bars: document.song.measureHeaders.length,
    tracks: document.song.tracks.map((track, index) => `${index + 1}: ${track.name}`),
    view: editor.mode,
    ...(editor.cursor === undefined ? {} : { cursor: cursorJson(editor.cursor) }),
    ...(selection === undefined ? {} : { selection }),
    canUndo: editor.past.length > 0,
    canRedo: editor.future.length > 0,
    ...(editor.hint === undefined ? {} : { hint: editor.hint }),
    ...(editor.error === undefined ? {} : { error: editor.error }),
  };
}

/** The window: its tabs, the shown tab's document, cursor, selection and history, and playback. */
export function stateJson(workspace: WorkspaceState, playback: PlaybackView): JsonObject {
  const shown = workspace.tabs.find((tab) => tab.id === workspace.activeTabId);
  const tabs = workspace.tabs.map(({ id, editor }) => ({
    tab: id,
    title: editor.document === undefined ? '' : tabTitle(editor.document),
    path: editor.document?.path === '' ? null : (editor.document?.path ?? null),
    isEdited: isEdited(editor),
    isShown: id === workspace.activeTabId,
  }));
  const document = shown === undefined ? undefined : documentJson(shown.editor);
  return {
    tabs,
    shownTab: workspace.activeTabId ?? null,
    document: document ?? null,
    playback: playbackJson(playback, shown?.editor.document?.song.measureHeaders.length ?? 0),
    ...(workspace.error === undefined ? {} : { error: workspace.error }),
  };
}
