// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// Writing at the cursor as the keys do: a fret on a string (the digits), a drum (the drum kit), a rest, a whole
// duration (the palette's durations, dots and tuplets in one step), a beat inserted or deleted (I, ⇧⌫), undo and redo.
// The cursor goes to the given position first; each edit is one undo step, seen in the score at once.

import { MAX_DRUM_KEY, MAX_FRET, NOTE_VALUES, type NoteValue, TUPLET_SIZES, findNote } from '@gp-editor/core';
import type { EditorAction } from '../../state/editor';
import type { AppHost } from '../app-host';
import { beatAtJson } from '../bars-json';
import { cursorJson } from '../song-json';
import type { McpTool, ToolArguments, ToolResult } from '../tool-types';
import {
  POSITION_ARGUMENTS,
  STRING_ARGUMENT,
  TAB_ARGUMENT,
  answer,
  cursorAnswer,
  editAt,
  editTab,
  editorIn,
  objectSchema,
  optionalInteger,
  readTab,
  toolError,
  unchanged,
} from './tool-kit';

const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const ERASE = { ...EDIT, destructiveHint: true } as const;

/** The track an edit at these arguments acts on (0-based), for checks before it runs. */
function trackAt(host: AppHost, args: ToolArguments): { readonly index: number; readonly isPercussion: boolean } | undefined {
  const target = readTab(host.workspace(), typeof args.tab === 'string' ? args.tab : undefined);
  if (!target.ok) {
    return undefined;
  }
  const index = (optionalInteger(args, 'track') ?? (target.editor.cursor?.trackIndex ?? target.editor.trackIndex) + 1) - 1;
  return { index, isPercussion: target.song.tracks[index]?.isPercussion === true };
}

/** Runs one editor action at the arguments' position; `describe` words the change, or the failure when nothing changed. */
function runEdit(host: AppHost, args: ToolArguments, action: EditorAction, describe: string, refused: string): ToolResult {
  const edited = editAt(host, args, action);
  if (!edited.ok) {
    return edited.result;
  }
  const { editor, isChanged } = edited.outcome;
  return isChanged ? cursorAnswer(describe, editor) : unchanged(editor, refused);
}

const writeNote: McpTool<AppHost> = {
  name: 'write_note',
  title: 'Write a note',
  description:
    'Writes a fret on a string at the cursor (or the bar/beat given), as typing the fret does: an empty voice is filled with rests to the bar line first. Set the duration with set_duration before or after. advance: true then moves to the next beat (to write a melody: set_duration, write_note with advance, repeat). Not for drum tracks (use toggle_drum_note).',
  inputSchema: objectSchema(
    {
      string: STRING_ARGUMENT,
      fret: { type: 'integer', minimum: 0, maximum: MAX_FRET, description: 'Fret number as the tab shows it (0 = open string).' },
      ...POSITION_ARGUMENTS,
      advance: { type: 'boolean', description: 'Move the cursor to the next beat afterwards (not an undo step). Default false.' },
    },
    ['string', 'fret'],
  ),
  annotations: EDIT,
  run: (args, host) => {
    const fret = optionalInteger(args, 'fret') ?? 0;
    if (trackAt(host, args)?.isPercussion === true) {
      return toolError('This is a drum track: write drums with toggle_drum_note (a General MIDI drum key).');
    }
    const edited = editAt(host, args, { type: 'setNoteFret', fret });
    if (!edited.ok) {
      return edited.result;
    }
    const { editor, isChanged, song } = edited.outcome;
    const at = editor.cursor;
    const note = at === undefined ? undefined : findNote(song, at);
    if (at === undefined || (!isChanged && note?.fret !== fret)) {
      return unchanged(editor, `Nothing changed: fret ${fret} cannot go on that string.`);
    }
    const written = beatAtJson(song, at);
    const tabId = host.workspace().activeTabId ?? '';
    const after = args.advance === true ? (editorIn(host.dispatch({ type: 'inTab', tabId, action: { type: 'moveCursorBeat', step: 1 } }), tabId) ?? editor) : editor;
    const where = `bar ${at.measureIndex + 1}, beat ${at.beatIndex + 1}`;
    return answer(`Fret ${fret} on string ${at.string} at ${where}.`, { written: written ?? null, cursor: after.cursor === undefined ? null : cursorJson(after.cursor) });
  },
};

const toggleDrumNote: McpTool<AppHost> = {
  name: 'toggle_drum_note',
  title: 'Write or remove a drum',
  description: 'On a drum track: adds the drum (a General MIDI key, e.g. 36 kick, 38 snare, 42 closed hi-hat, 49 crash) to the beat at the cursor, or takes it out when the beat already plays it — as a click on the drum kit does.',
  inputSchema: objectSchema({ key: { type: 'integer', minimum: 0, maximum: MAX_DRUM_KEY, description: 'General MIDI drum key.' }, ...POSITION_ARGUMENTS }, ['key']),
  annotations: EDIT,
  run: (args, host) => {
    if (trackAt(host, args)?.isPercussion !== true) {
      return toolError('This is not a drum track: write notes with write_note.');
    }
    const key = optionalInteger(args, 'key') ?? 0;
    return runEdit(host, args, { type: 'toggleDrumNote', key }, `Drum key ${key} toggled.`, 'Nothing changed.');
  },
};

const writeRest: McpTool<AppHost> = {
  name: 'write_rest',
  title: 'Make the beat a rest',
  description: 'The beat at the cursor (in the cursor’s voice) becomes a rest of the same length: its notes go.',
  inputSchema: objectSchema(POSITION_ARGUMENTS),
  annotations: ERASE,
  run: (args, host) => runEdit(host, args, { type: 'edit', edit: { type: 'makeRest' } }, 'The beat is a rest.', 'Nothing changed: the beat is already a rest.'),
};

const deleteNote: McpTool<AppHost> = {
  name: 'delete_note',
  title: 'Delete a note',
  description: 'Deletes the note on one string at the cursor’s beat; the beat becomes a rest when it was its last note.',
  inputSchema: objectSchema({ string: STRING_ARGUMENT, ...POSITION_ARGUMENTS }, ['string']),
  annotations: ERASE,
  run: (args, host) => runEdit(host, args, { type: 'deleteNote' }, 'The note is deleted.', 'Nothing changed: no note on that string at this beat.'),
};

const DOTS = [0, 1, 2] as const;

const setDuration: McpTool<AppHost> = {
  name: 'set_duration',
  title: 'Set the beat’s duration',
  description:
    'Sets the duration of the beat at the cursor in one undo step: note value (1 whole, 2 half, 4 quarter, 8 eighth, 16, 32, 64), dots and tuplet (3 = triplet, 1 = none). A shorter beat leaves rests after it; a longer one takes the time of what follows.',
  inputSchema: objectSchema(
    {
      value: { type: 'integer', enum: NOTE_VALUES, description: 'Note value: 1, 2, 4, 8, 16, 32 or 64.' },
      dots: { type: 'integer', enum: DOTS, description: 'Dots: 0, 1 or 2. Default 0.' },
      tuplet: { type: 'integer', enum: [1, ...TUPLET_SIZES], description: 'Notes in the tuplet (3 = triplet); 1 = no tuplet. Default 1.' },
      ...POSITION_ARGUMENTS,
    },
    ['value'],
  ),
  annotations: EDIT,
  run: (args, host) => {
    const value = (optionalInteger(args, 'value') ?? 4) as NoteValue;
    const dots = (optionalInteger(args, 'dots') ?? 0) as 0 | 1 | 2;
    const tuplet = optionalInteger(args, 'tuplet') ?? 1;
    return runEdit(host, args, { type: 'edit', edit: { type: 'setDuration', value, dots, tuplet } }, 'The duration is set.', 'Nothing changed: the beat already has that duration.');
  },
};

const insertBeat: McpTool<AppHost> = {
  name: 'insert_beat',
  title: 'Insert a beat',
  description: 'Inserts a rest after the cursor’s beat, of its duration, and moves onto it (the I key); what follows moves on.',
  inputSchema: objectSchema(POSITION_ARGUMENTS),
  annotations: EDIT,
  run: (args, host) => runEdit(host, args, { type: 'edit', edit: { type: 'insertBeat' } }, 'A beat is inserted.', 'Nothing changed.'),
};

const deleteBeat: McpTool<AppHost> = {
  name: 'delete_beat',
  title: 'Delete a beat',
  description: 'Deletes the cursor’s beat (⇧⌫); what follows moves up and the bar is padded with rests.',
  inputSchema: objectSchema(POSITION_ARGUMENTS),
  annotations: ERASE,
  run: (args, host) => runEdit(host, args, { type: 'edit', edit: { type: 'deleteBeat' } }, 'The beat is deleted.', 'Nothing changed.'),
};

function historyTool(name: 'undo' | 'redo', description: string): McpTool<AppHost> {
  return {
    name,
    title: name === 'undo' ? 'Undo' : 'Redo',
    description,
    inputSchema: objectSchema({ tab: TAB_ARGUMENT }),
    annotations: { ...EDIT, destructiveHint: true },
    run: (args, host) => {
      const target = editTab(host, args);
      if (!target.ok) {
        return target.result;
      }
      const steps = name === 'undo' ? target.editor.past.length : target.editor.future.length;
      if (steps === 0) {
        return toolError(`Nothing to ${name}.`);
      }
      const editor = editorIn(host.dispatch({ type: 'inTab', tabId: target.tab.id, action: { type: name } }), target.tab.id) ?? target.editor;
      return cursorAnswer(name === 'undo' ? 'Undone.' : 'Redone.', editor);
    },
  };
}

export const NOTE_TOOLS: readonly McpTool<AppHost>[] = [
  writeNote,
  toggleDrumNote,
  writeRest,
  deleteNote,
  setDuration,
  insertBeat,
  deleteBeat,
  historyTool('undo', 'Undoes the last edit of the tab (Edit ▸ Undo, ⌘Z), whoever made it.'),
  historyTool('redo', 'Redoes the last undone edit (Edit ▸ Redo, ⇧⌘Z).'),
];
