// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// Reading the window: what is open, the song, and a track's bars as JSON or as ASCII tab (gp-core's writer).

import { MAX_VOICES, type Song, writeAsciiTab } from '@gp-editor/core';
import type { AppHost } from '../app-host';
import { barJson } from '../bars-json';
import { songJson, stateJson } from '../song-json';
import type { McpTool, ToolArguments, ToolResult } from '../tool-types';
import { BAR_ARGUMENT, TAB_ARGUMENT, TRACK_ARGUMENT, VOICE_ARGUMENT, answer, objectSchema, optionalInteger, optionalString, readTab, toolError } from './tool-kit';

/** At most this many bars per call: a long song is read in pages, so an answer stays a readable size. */
const MAX_BARS_PER_READ = 32;

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

const BAR_RANGE = {
  track: TRACK_ARGUMENT,
  fromBar: { ...BAR_ARGUMENT, description: 'First bar to read. Default: the cursor’s bar.' },
  toBar: { ...BAR_ARGUMENT, description: `Last bar to read (at most ${MAX_BARS_PER_READ} bars per call). Default: fromBar.` },
  tab: TAB_ARGUMENT,
};

interface BarRange {
  readonly trackIndex: number;
  readonly from: number;
  readonly to: number;
}

/** The track and bars a read asks for (0-based), checked against the song; or why not. */
function barRange(song: Song, cursorTrack: number, cursorBar: number, args: ToolArguments): BarRange | string {
  const trackIndex = (optionalInteger(args, 'track') ?? cursorTrack + 1) - 1;
  const from = (optionalInteger(args, 'fromBar') ?? cursorBar + 1) - 1;
  const to = (optionalInteger(args, 'toBar') ?? from + 1) - 1;
  const barCount = song.measureHeaders.length;
  if (trackIndex >= song.tracks.length) {
    return `Track ${trackIndex + 1} does not exist: the song has ${song.tracks.length} track(s).`;
  }
  if (from >= barCount || to >= barCount) {
    return `Bar ${Math.max(from, to) + 1} does not exist: the song has ${barCount} bar(s).`;
  }
  if (to < from) {
    return 'toBar comes before fromBar.';
  }
  return to - from >= MAX_BARS_PER_READ ? `At most ${MAX_BARS_PER_READ} bars per call: read bars ${from + 1}–${from + MAX_BARS_PER_READ} first.` : { trackIndex, from, to };
}

function readRange(host: AppHost, args: ToolArguments): { readonly song: Song; readonly range: BarRange } | ToolResult {
  const target = readTab(host.workspace(), optionalString(args, 'tab'));
  if (!target.ok) {
    return target.result;
  }
  const { editor, song } = target;
  const range = barRange(song, editor.cursor?.trackIndex ?? editor.trackIndex, editor.cursor?.measureIndex ?? 0, args);
  return typeof range === 'string' ? toolError(range) : { song, range };
}

const getState: McpTool<AppHost> = {
  name: 'get_state',
  title: 'Window state',
  description:
    'What GP Editor shows now: the open tabs (ids, titles, files, unsaved changes), the shown document (bars, tracks, view, cursor, selection, undo/redo, the hint strip’s last message) and playback. Call it first, and again after edits to see the cursor.',
  inputSchema: objectSchema({}),
  annotations: READ_ONLY,
  run: (_, host) => answer('The window now:', stateJson(host.workspace(), host.playback())),
};

const getSong: McpTool<AppHost> = {
  name: 'get_song',
  title: 'Song overview',
  description:
    'The song of a tab: title, artist and credits, bar count, tracks (instrument, tuning from string 1 = highest, capo, mute/solo), and the bars where the time signature, tempo, key or sections change.',
  inputSchema: objectSchema({ tab: TAB_ARGUMENT }),
  annotations: READ_ONLY,
  run: (args, host) => {
    const target = readTab(host.workspace(), optionalString(args, 'tab'));
    return target.ok ? answer(`The song of ${target.tab.id}:`, songJson(target.song)) : target.result;
  },
};

const getBars: McpTool<AppHost> = {
  name: 'get_bars',
  title: 'Read bars',
  description:
    'Bars of one track as JSON: per bar its time signature, tempo, key and section, and per voice its beats — beat number, where it starts in the bar (in quarter notes), duration (value 1/2/4/8/16/32/64, dots, tuplet "3:2"), rest or notes (string 1 = highest, fret; for drums the fret is the General MIDI drum key) with their effects.',
  inputSchema: objectSchema({ ...BAR_RANGE, voice: { ...VOICE_ARGUMENT, description: 'Only this voice (1–4). Default: every voice with beats.' } }),
  annotations: READ_ONLY,
  run: (args, host) => {
    const read = readRange(host, args);
    if (!('range' in read)) {
      return read;
    }
    const { song, range } = read;
    const voice = optionalInteger(args, 'voice');
    const voices = voice === undefined ? Array.from({ length: MAX_VOICES }, (_, index) => index) : [voice - 1];
    const bars = Array.from({ length: range.to - range.from + 1 }, (_, offset) => barJson(song, range.trackIndex, range.from + offset, voices) ?? {});
    const track = song.tracks[range.trackIndex];
    return answer(`Bars ${range.from + 1}–${range.to + 1} of track ${range.trackIndex + 1} (${track?.name ?? ''}):`, { track: range.trackIndex + 1, bars });
  },
};

const getAsciiTab: McpTool<AppHost> = {
  name: 'get_ascii_tab',
  title: 'Read bars as ASCII tab',
  description: 'Bars of one track as ASCII tablature, as File ▸ Export ASCII Tab… writes them (string 1 = the top line). Quick to read; use get_bars for durations and effects.',
  inputSchema: objectSchema(BAR_RANGE),
  annotations: READ_ONLY,
  run: (args, host) => {
    const read = readRange(host, args);
    if (!('range' in read)) {
      return read;
    }
    const { song, range } = read;
    const track = song.tracks[range.trackIndex];
    if (track === undefined || track.isPercussion) {
      return toolError(`Track ${range.trackIndex + 1} is a drum track: ASCII tab has no drum notation. Use get_bars.`);
    }
    // The writer looks each measure's header up by its index, so a track holding only these measures writes these bars.
    const view: Song = { ...song, tracks: [{ ...track, measures: track.measures.slice(range.from, range.to + 1) }] };
    return { text: writeAsciiTab(view, { trackIndexes: [0] }) };
  },
};

export const READ_TOOLS: readonly McpTool<AppHost>[] = [getState, getSong, getBars, getAsciiTab];
