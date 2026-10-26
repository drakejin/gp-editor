// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// Everything else the app does: the command palette's registry (menus, panels, every editor key, the edition palette's
// tools), listed with English titles and run by id exactly as the palette runs it.

import type { Command } from '../../lib/command-types';
import type { AppHost } from '../app-host';
import type { McpTool, ToolResult } from '../tool-types';
import { cursorAnswer, objectSchema, optionalString, toolError } from './tool-kit';

function matches(command: Command, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
  const haystack = [command.id, command.title, command.group, ...command.keywords].join(' ').toLowerCase();
  return words.every((word) => haystack.includes(word));
}

function commandLine(command: Command, isEnabled: boolean): string {
  const shortcut = command.shortcut === undefined ? '' : ` [${command.shortcut}]`;
  return `${command.id} — ${command.title} (${command.group})${shortcut}${isEnabled ? '' : ' (not available now)'}`;
}

const listCommands: McpTool<AppHost> = {
  name: 'list_commands',
  title: 'List the app’s commands',
  description:
    'Lists GP Editor’s commands — the menus, panels, every editor key and the edition palette’s tools (effects, articulations, dynamics, repeats …) — with their ids, English titles, groups, shortcuts and whether they can run now (most act on the cursor’s note, beat or bar). Filter with query (words that must all appear). Run one with run_command.',
  inputSchema: objectSchema({ query: { type: 'string', maxLength: 100, description: 'Words to look for in the id, title, group or keywords (e.g. "palm mute", "repeat", "export").' } }),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  run: (args, host): ToolResult => {
    const query = optionalString(args, 'query') ?? '';
    const state = host.commands.state();
    const found = host.commands.list().filter((command) => matches(command, query));
    const commands = found.map((command) => ({ id: command.id, title: command.title, group: command.group, ...(command.shortcut === undefined ? {} : { shortcut: command.shortcut }), isEnabled: command.isEnabled(state) }));
    const lines = found.map((command, index) => commandLine(command, commands[index]?.isEnabled === true));
    return { text: lines.length === 0 ? `No command matches "${query}".` : lines.join('\n'), structured: { commands } };
  },
};

const runCommand: McpTool<AppHost> = {
  name: 'run_command',
  title: 'Run a command',
  description:
    'Runs one command of list_commands by its id, exactly as the command palette does (e.g. "note.palmMute" toggles palm mute on the cursor’s note, "palette.dynamic.4" sets a dynamic, "view.multitrack" shows every track). Edits are one undo step each. Commands that open a panel or dialog show it to the person at the Mac.',
  inputSchema: objectSchema({ id: { type: 'string', minLength: 1, maxLength: 100, description: 'A command id from list_commands.' } }, ['id']),
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  run: async (args, host) => {
    const id = optionalString(args, 'id') ?? '';
    const command = host.commands.list().find((each) => each.id === id);
    if (command === undefined) {
      return toolError(`No command "${id}": see list_commands.`);
    }
    if (!command.isEnabled(host.commands.state())) {
      return toolError(`${id} (${command.title}) cannot run now: it needs an open score and, for most, a note, beat or bar at the cursor (move_cursor).`);
    }
    command.run(host.commands.actions());
    const workspace = await host.settle();
    const editor = workspace.tabs.find((tab) => tab.id === workspace.activeTabId)?.editor;
    const text = `Ran ${id} (${command.title}).${editor?.hint === undefined ? '' : ` The window says: ${editor.hint}`}`;
    return editor === undefined ? { text } : cursorAnswer(text, editor);
  },
};

export const COMMAND_TOOLS: readonly McpTool<AppHost>[] = [listCommands, runCommand];
