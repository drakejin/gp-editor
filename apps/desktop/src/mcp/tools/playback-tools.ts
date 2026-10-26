// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// Playback as the transport plays it: Space (from the cursor's bar, or the selection), a bar to start from, stop,
// pause (stop with the cursor where it was heard, so play goes on from there), the loop and the speed. The song is
// never edited; the settings are the session's practice settings.

import { MAX_SPEED_PERCENT, MIN_SPEED_PERCENT } from '../../lib/practice-tempo';
import { playbackStartTempo } from '../../state/practice';
import { selectionBars } from '../../state/selection';
import type { AppHost } from '../app-host';
import { playbackJson } from '../song-json';
import type { McpTool, ToolArguments, ToolResult } from '../tool-types';
import { BAR_ARGUMENT, TAB_ARGUMENT, answer, editTab, objectSchema, optionalInteger, placeCursor, toolError } from './tool-kit';

const PLAYBACK = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

/** The window once the transport has caught up with what was asked. */
async function playbackAnswer(host: AppHost, text: string): Promise<ToolResult> {
  const workspace = await host.settle();
  const song = workspace.tabs.find((tab) => tab.id === workspace.activeTabId)?.editor.document?.song;
  return answer(text, { playback: playbackJson(host.playback(), song?.measureHeaders.length ?? 0) });
}

const play: McpTool<AppHost> = {
  name: 'play',
  title: 'Play',
  description: 'Starts playback of the shown tab: from fromBar, else as Space does (the selection, else the cursor’s bar; within the loop when it is on), at the practice speed.',
  inputSchema: objectSchema({ fromBar: { ...BAR_ARGUMENT, description: 'Bar to start from. Default: the cursor’s bar (or the selection).' }, tab: TAB_ARGUMENT }),
  annotations: PLAYBACK,
  run: async (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const fromBar = optionalInteger(args, 'fromBar');
    const barCount = target.song.measureHeaders.length;
    if (fromBar !== undefined && fromBar > barCount) {
      return toolError(`Bar ${fromBar} does not exist: the song has ${barCount} bar(s).`);
    }
    if (fromBar !== undefined) {
      host.startPlayback(fromBar - 1);
    } else if (!host.playback().isPlaying) {
      host.runCommand({ type: 'togglePlayback' });
    }
    return playbackAnswer(host, fromBar === undefined ? 'Playing.' : `Playing from bar ${fromBar}.`);
  },
};

const stop: McpTool<AppHost> = {
  name: 'stop',
  title: 'Stop',
  description: 'Stops playback (the cursor stays where it was).',
  inputSchema: objectSchema({}),
  annotations: { ...PLAYBACK, idempotentHint: true },
  run: (_, host) => {
    host.stopPlayback();
    return playbackAnswer(host, 'Stopped.');
  },
};

const pause: McpTool<AppHost> = {
  name: 'pause',
  title: 'Pause',
  description: 'Stops playback and puts the cursor on the beat that was sounding, so play goes on from that bar (GP Editor’s transport has no separate pause).',
  inputSchema: objectSchema({}),
  annotations: PLAYBACK,
  run: (_, host) => {
    const { isPlaying, playing } = host.playback();
    const workspace = host.workspace();
    const editor = workspace.tabs.find((tab) => tab.id === workspace.activeTabId)?.editor;
    if (!isPlaying || editor === undefined) {
      return toolError('Nothing is playing.');
    }
    host.stopPlayback();
    const cursor = editor.cursor;
    if (playing !== undefined && cursor !== undefined && workspace.activeTabId !== undefined) {
      placeCursor(host, workspace.activeTabId, { ...cursor, trackIndex: editor.trackIndex, measureIndex: playing.measureIndex, beatIndex: playing.beatIndex });
    }
    return playbackAnswer(host, playing === undefined ? 'Paused.' : `Paused at bar ${playing.measureIndex + 1}, beat ${playing.beatIndex + 1}.`);
  },
};

/** The loop's bars from the arguments (0-based), checked; undefined when none were named. */
function loopRange(args: ToolArguments, barCount: number): { readonly fromMeasureIndex: number; readonly toMeasureIndex: number } | string | undefined {
  const fromBar = optionalInteger(args, 'fromBar');
  const toBar = optionalInteger(args, 'toBar') ?? fromBar;
  if (fromBar === undefined || toBar === undefined) {
    return undefined;
  }
  if (toBar < fromBar || toBar > barCount) {
    return toBar < fromBar ? 'toBar comes before fromBar.' : `Bar ${toBar} does not exist: the song has ${barCount} bar(s).`;
  }
  return { fromMeasureIndex: fromBar - 1, toMeasureIndex: toBar - 1 };
}

const setLoop: McpTool<AppHost> = {
  name: 'set_loop',
  title: 'Loop',
  description: 'Turns the loop on or off. On: plays fromBar–toBar over and over (default: the selection’s bars, else the whole song) until stopped.',
  inputSchema: objectSchema(
    { isOn: { type: 'boolean', description: 'true: loop; false: play through.' }, fromBar: BAR_ARGUMENT, toBar: { ...BAR_ARGUMENT, description: 'Last bar of the loop. Default: fromBar.' }, tab: TAB_ARGUMENT },
    ['isOn'],
  ),
  annotations: { ...PLAYBACK, idempotentHint: true },
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const measureCount = target.song.measureHeaders.length;
    const range = loopRange(args, measureCount);
    if (typeof range === 'string') {
      return toolError(range);
    }
    const { isLooping } = host.playback().practice;
    if (args.isOn !== true) {
      if (isLooping) {
        host.changePractice({ type: 'toggleLoop', measureCount });
      }
      return playbackAnswer(host, 'The loop is off.');
    }
    if (!isLooping) {
      host.changePractice({ type: 'toggleLoop', measureCount, selection: range ?? selectionBars(target.editor) });
    } else if (range !== undefined) {
      host.changePractice({ type: 'setLoop', range, measureCount });
    }
    return playbackAnswer(host, 'The loop is on.');
  },
};

const setSpeed: McpTool<AppHost> = {
  name: 'set_speed',
  title: 'Playback speed',
  description: `Plays at a percentage of the written tempo (${MIN_SPEED_PERCENT}–${MAX_SPEED_PERCENT}%, 100 = as written), as the transport’s speed menu does. The song is not changed.`,
  inputSchema: objectSchema({ percent: { type: 'integer', minimum: MIN_SPEED_PERCENT, maximum: MAX_SPEED_PERCENT, description: 'Speed in percent.' }, tab: TAB_ARGUMENT }, ['percent']),
  annotations: { ...PLAYBACK, idempotentHint: true },
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const percent = optionalInteger(args, 'percent') ?? 100;
    const writtenTempo = playbackStartTempo(target.song, host.playback().practice, target.editor.cursor?.measureIndex ?? 0);
    host.changePractice({ type: 'setTempoScale', scale: percent / 100, writtenTempo });
    return playbackAnswer(host, `Speed ${percent}%.`);
  },
};

export const PLAYBACK_TOOLS: readonly McpTool<AppHost>[] = [play, pause, stop, setLoop, setSpeed];
