// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// Bars and the song as the edition palette, the Bar group and the inspector edit them: bars inserted and deleted, the
// tempo, time signature and key from a bar on, a track's name, the song's information. One undo step each.

import { MAX_TEMPO, MIN_TEMPO, type SongInfo } from '@gp-editor/core';
import type { EditorAction } from '../../state/editor';
import type { AppHost } from '../app-host';
import { songJson } from '../song-json';
import type { JsonSchema } from '../json-schema';
import type { McpTool, ToolArguments, ToolResult } from '../tool-types';
import { BAR_ARGUMENT, TAB_ARGUMENT, TRACK_ARGUMENT, answer, editAt, editTab, editorIn, objectSchema, optionalInteger, toolError, unchanged } from './tool-kit';

const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const FROM_BAR: Readonly<Record<string, JsonSchema>> = {
  bar: { ...BAR_ARGUMENT, description: 'The bar it starts at; the bars after it that had the same value follow. Default: the cursor’s bar.' },
  tab: TAB_ARGUMENT,
};

/** A bar edit at the arguments' bar (the cursor goes there): what it set, read back from the song, or why nothing changed. */
function barEdit(host: AppHost, args: ToolArguments, action: EditorAction, describe: (bar: number) => string, refused: string): ToolResult {
  const edited = editAt(host, args, action);
  if (!edited.ok) {
    return edited.result;
  }
  const { editor, isChanged, song } = edited.outcome;
  const bar = (editor.cursor?.measureIndex ?? 0) + 1;
  if (!isChanged) {
    return unchanged(editor, refused);
  }
  const { timeSignatures, tempos, keySignatures } = songJson(song);
  return answer(describe(bar), { timeSignatures, tempos, keySignatures });
}

const insertBar: McpTool<AppHost> = {
  name: 'insert_bar',
  title: 'Insert a bar',
  description: 'Inserts an empty bar (rests) after a bar, in every track, and moves the cursor into it (the palette’s + Bar).',
  inputSchema: objectSchema({ afterBar: { ...BAR_ARGUMENT, description: 'The new bar comes after this one. Default: the cursor’s bar.' }, tab: TAB_ARGUMENT }),
  annotations: { ...EDIT, idempotentHint: false },
  run: (args, host) => {
    const bar = optionalInteger(args, 'afterBar');
    const edited = editAt(host, bar === undefined ? args : { ...args, bar }, { type: 'edit', edit: { type: 'insertMeasure' } });
    if (!edited.ok) {
      return edited.result;
    }
    const { editor, song } = edited.outcome;
    return answer(`Bar ${(editor.cursor?.measureIndex ?? 0) + 1} is new; the song has ${song.measureHeaders.length} bars.`, { bars: song.measureHeaders.length });
  },
};

const deleteBars: McpTool<AppHost> = {
  name: 'delete_bars',
  title: 'Delete bars',
  description: 'Deletes bars fromBar–toBar in every track, in one undo step (the palette’s − Bar). The last bar of a song is never deleted.',
  inputSchema: objectSchema({ fromBar: BAR_ARGUMENT, toBar: { ...BAR_ARGUMENT, description: 'Last bar to delete. Default: fromBar.' }, tab: TAB_ARGUMENT }, ['fromBar']),
  annotations: { ...EDIT, destructiveHint: true, idempotentHint: false },
  run: (args, host) => {
    const fromBar = optionalInteger(args, 'fromBar') ?? 1;
    const toBar = optionalInteger(args, 'toBar') ?? fromBar;
    if (toBar < fromBar) {
      return toolError('toBar comes before fromBar.');
    }
    const action: EditorAction = { type: 'edit', edit: { type: 'deleteMeasure', from: { measureIndex: fromBar - 1, beatIndex: 0 } } };
    const edited = editAt(host, { ...args, bar: toBar, beat: 1 }, action);
    if (!edited.ok) {
      return edited.result;
    }
    const { editor, isChanged, song } = edited.outcome;
    return isChanged ? answer(`Deleted bars ${fromBar}–${toBar}; the song has ${song.measureHeaders.length} bars.`, { bars: song.measureHeaders.length }) : unchanged(editor, 'Nothing changed.');
  },
};

const setTempo: McpTool<AppHost> = {
  name: 'set_tempo',
  title: 'Set the tempo',
  description: 'Sets the written tempo (quarter notes per minute, two decimals) from a bar on. For playback speed alone use set_speed.',
  inputSchema: objectSchema({ bpm: { type: 'number', minimum: MIN_TEMPO, maximum: MAX_TEMPO, description: 'Beats (quarter notes) per minute.' }, ...FROM_BAR }, ['bpm']),
  annotations: EDIT,
  run: (args, host) => {
    const tempo = typeof args.bpm === 'number' ? args.bpm : 120;
    return barEdit(host, args, { type: 'edit', edit: { type: 'setTempo', tempo } }, (bar) => `Tempo ${tempo} from bar ${bar}.`, 'Nothing changed: the bar already has that tempo.');
  },
};

const setTimeSignature: McpTool<AppHost> = {
  name: 'set_time_signature',
  title: 'Set the time signature',
  description: 'Sets the time signature from a bar on. A shorter one is refused where a bar is full of notes (the answer says which).',
  inputSchema: objectSchema(
    {
      numerator: { type: 'integer', minimum: 1, maximum: 32, description: 'Beats per bar.' },
      denominator: { type: 'integer', enum: [1, 2, 4, 8, 16, 32], description: 'The beat’s note value: 4 = quarter, 8 = eighth.' },
      ...FROM_BAR,
    },
    ['numerator', 'denominator'],
  ),
  annotations: EDIT,
  run: (args, host) => {
    const numerator = optionalInteger(args, 'numerator') ?? 4;
    const denominator = optionalInteger(args, 'denominator') ?? 4;
    const action: EditorAction = { type: 'edit', edit: { type: 'setTimeSignature', numerator, denominator } };
    return barEdit(host, args, action, (bar) => `Time signature ${numerator}/${denominator} from bar ${bar}.`, 'Nothing changed: the bar already has that time signature.');
  },
};

const setKeySignature: McpTool<AppHost> = {
  name: 'set_key_signature',
  title: 'Set the key signature',
  description: 'Sets the key signature from a bar on: -7 (7 flats) … 0 (C major / A minor) … 7 (7 sharps).',
  inputSchema: objectSchema({ key: { type: 'integer', minimum: -7, maximum: 7, description: 'Flats as negative numbers, sharps as positive.' }, ...FROM_BAR }, ['key']),
  annotations: EDIT,
  run: (args, host) => {
    const keySignature = optionalInteger(args, 'key') ?? 0;
    return barEdit(host, args, { type: 'edit', edit: { type: 'setKeySignature', keySignature } }, (bar) => `Key signature ${keySignature} from bar ${bar}.`, 'Nothing changed: the bar already has that key.');
  },
};

/** A song or track edit (no cursor move): the editor after it, or why it changed nothing. */
function songEdit(host: AppHost, args: ToolArguments, action: (trackIndex: number) => EditorAction, describe: string): ToolResult {
  const target = editTab(host, args);
  if (!target.ok) {
    return target.result;
  }
  const trackIndex = (optionalInteger(args, 'track') ?? target.editor.trackIndex + 1) - 1;
  if (trackIndex >= target.song.tracks.length) {
    return toolError(`Track ${trackIndex + 1} does not exist: the song has ${target.song.tracks.length} track(s).`);
  }
  const editor = editorIn(host.dispatch({ type: 'inTab', tabId: target.tab.id, action: action(trackIndex) }), target.tab.id) ?? target.editor;
  return editor.document?.song === target.song ? unchanged(editor, 'Nothing changed: it already had that value.') : answer(describe);
}

const setTrackName: McpTool<AppHost> = {
  name: 'set_track_name',
  title: 'Rename a track',
  description: 'Renames a track (the tracks panel’s name).',
  inputSchema: objectSchema({ name: { type: 'string', minLength: 1, maxLength: 100, description: 'The new name.' }, track: TRACK_ARGUMENT, tab: TAB_ARGUMENT }, ['name']),
  annotations: EDIT,
  run: (args, host) => {
    const name = typeof args.name === 'string' ? args.name : '';
    return songEdit(host, args, (trackIndex) => ({ type: 'setTrackName', trackIndex, name }), `The track is named "${name}".`);
  },
};

const SONG_INFO_FIELDS = ['title', 'subtitle', 'artist', 'album', 'words', 'music', 'copyright', 'transcriber'] as const;

const setSongInfo: McpTool<AppHost> = {
  name: 'set_song_info',
  title: 'Set the song information',
  description: 'Sets the song’s title, subtitle, artist, album, words (lyricist), music (composer), copyright or transcriber — any of them, in one undo step.',
  inputSchema: objectSchema({ ...Object.fromEntries(SONG_INFO_FIELDS.map((field) => [field, { type: 'string', maxLength: 500 } as JsonSchema])), tab: TAB_ARGUMENT }),
  annotations: EDIT,
  run: (args, host) => {
    const info: Partial<SongInfo> = Object.fromEntries(SONG_INFO_FIELDS.filter((field) => typeof args[field] === 'string').map((field) => [field, args[field]]));
    if (Object.keys(info).length === 0) {
      return toolError(`Give at least one of ${SONG_INFO_FIELDS.join(', ')}.`);
    }
    return songEdit(host, args, () => ({ type: 'setSongInfo', info }), `Set ${Object.keys(info).join(', ')}.`);
  },
};

export const BAR_TOOLS: readonly McpTool<AppHost>[] = [insertBar, deleteBars, setTempo, setTimeSignature, setKeySignature, setTrackName, setSongInfo];
