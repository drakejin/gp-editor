// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// Moving around the window as a click, the arrows and a drag do: the cursor (track, bar, beat, string, voice), a
// selection of bars, and the shown tab. None of these is an undo step.

import type { AppHost } from '../app-host';
import { stateJson } from '../song-json';
import type { McpTool } from '../tool-types';
import {
  BAR_ARGUMENT,
  POSITION_ARGUMENTS,
  STRING_ARGUMENT,
  TAB_ARGUMENT,
  TRACK_ARGUMENT,
  addressAt,
  answer,
  cursorAnswer,
  editTab,
  editorIn,
  objectSchema,
  optionalInteger,
  placeCursor,
  toolError,
} from './tool-kit';

const VIEW_ONLY = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const moveCursor: McpTool<AppHost> = {
  name: 'move_cursor',
  title: 'Move the cursor',
  description:
    'Puts the edit cursor on a track, bar, beat, string and voice (1-based; anything left out stays as it is, and another bar starts at its beat 1). Edits act at the cursor. The score scrolls to it. Not an undo step.',
  inputSchema: objectSchema({ ...POSITION_ARGUMENTS, string: STRING_ARGUMENT }),
  annotations: VIEW_ONLY,
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const place = addressAt(target.song, target.editor, args);
    if (!place.ok) {
      return toolError(place.problem);
    }
    const editor = editorIn(placeCursor(host, target.tab.id, place.address), target.tab.id) ?? target.editor;
    return cursorAnswer('The cursor moved.', editor);
  },
};

const selectBars: McpTool<AppHost> = {
  name: 'select_bars',
  title: 'Select bars',
  description:
    'Selects whole bars of a track in the cursor’s voice, as a drag over the score does: copy, cut, octave signs and hairpins act on the selection, and a loop turned on plays it. The cursor ends on the last selected beat. Not an undo step.',
  inputSchema: objectSchema({ fromBar: BAR_ARGUMENT, toBar: { ...BAR_ARGUMENT, description: 'Last bar to select. Default: fromBar.' }, track: TRACK_ARGUMENT, tab: TAB_ARGUMENT }, ['fromBar']),
  annotations: VIEW_ONLY,
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const fromBar = optionalInteger(args, 'fromBar') ?? 1;
    const toBar = optionalInteger(args, 'toBar') ?? fromBar;
    if (toBar < fromBar) {
      return toolError('toBar comes before fromBar.');
    }
    const start = addressAt(target.song, target.editor, { ...args, bar: fromBar, beat: 1 });
    const end = addressAt(target.song, target.editor, { ...args, bar: toBar, beat: 1 });
    if (!start.ok || !end.ok) {
      return toolError(start.ok ? (end.ok ? '' : end.problem) : start.problem);
    }
    const tabId = target.tab.id;
    placeCursor(host, tabId, start.address);
    const lastBeat = Math.max(1, target.song.tracks[end.address.trackIndex]?.measures[end.address.measureIndex]?.beats.length ?? 1) - 1;
    const selected = host.dispatch({ type: 'inTab', tabId, action: { type: 'selectTo', cursor: { ...end.address, voiceIndex: start.address.voiceIndex, beatIndex: lastBeat } } });
    return answer(`Selected bars ${fromBar}–${toBar}.`, stateJson(selected, host.playback()));
  },
};

const clearSelection: McpTool<AppHost> = {
  name: 'clear_selection',
  title: 'Clear the selection',
  description: 'Selects nothing (the cursor stays). Not an undo step.',
  inputSchema: objectSchema({ tab: TAB_ARGUMENT }),
  annotations: VIEW_ONLY,
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const editor = editorIn(host.dispatch({ type: 'inTab', tabId: target.tab.id, action: { type: 'clearSelection' } }), target.tab.id) ?? target.editor;
    return cursorAnswer('Nothing is selected.', editor);
  },
};

const switchTab: McpTool<AppHost> = {
  name: 'switch_tab',
  title: 'Show a tab',
  description: 'Shows another open document (a tab id from get_state). Playback stops, as when a tab is clicked.',
  inputSchema: objectSchema({ tab: { ...TAB_ARGUMENT, description: 'The tab to show, from get_state ("tab-2").' } }, ['tab']),
  annotations: VIEW_ONLY,
  run: (args, host) => {
    const target = editTab(host, args);
    return target.ok ? answer(`${target.tab.id} is shown.`, stateJson(host.workspace(), host.playback())) : target.result;
  },
};

export const CURSOR_TOOLS: readonly McpTool<AppHost>[] = [moveCursor, selectBars, clearSelection, switchTab];
