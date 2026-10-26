// i18n-exempt-file: the server's instructions for MCP clients (English, read by a language model), never shown in the app
// The MCP server's tools, in the order tools/list gives them (a fixed order: clients cache it), and what the server
// tells a model about driving GP Editor.

import type { AppHost } from '../app-host';
import type { McpTool } from '../tool-types';
import { BAR_TOOLS } from './bar-tools';
import { COMMAND_TOOLS } from './command-tools';
import { CURSOR_TOOLS } from './cursor-tools';
import { FILE_TOOLS } from './file-tools';
import { NOTE_TOOLS } from './note-tools';
import { PLAYBACK_TOOLS } from './playback-tools';
import { READ_TOOLS } from './read-tools';

export const APP_TOOLS: readonly McpTool<AppHost>[] = [...READ_TOOLS, ...CURSOR_TOOLS, ...NOTE_TOOLS, ...BAR_TOOLS, ...PLAYBACK_TOOLS, ...FILE_TOOLS, ...COMMAND_TOOLS];

export const SERVER_INSTRUCTIONS = [
  'This server drives GP Editor, a Guitar Pro editor open on this Mac: every tool acts on its window as a person would, and the person sees each change at once.',
  'Start with get_state (the open tabs, the cursor), then get_song and get_bars or get_ascii_tab to read the score.',
  'Numbers are 1-based as the window shows them: track, bar, beat (in the bar), voice 1–4; string 1 is the highest string. Durations are note values: 1 whole, 2 half, 4 quarter, 8 eighth, 16, 32, 64.',
  'Edits act at the cursor: give bar/beat/string to move it first, or use move_cursor. To write a melody: set_duration, then write_note with advance true, beat by beat; insert_bar adds room. Each edit is one undo step (undo, redo).',
  'Anything without its own tool — note effects, articulations, dynamics, repeats, views, panels — is a command: list_commands, then run_command.',
  'Files: open_file, save, save_as and export_file take absolute paths; without a path they show the panel to the person at the Mac.',
].join('\n');
