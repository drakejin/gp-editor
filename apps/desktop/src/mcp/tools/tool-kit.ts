// i18n-exempt-file: tool argument descriptions and errors for MCP clients, never shown in the app
// What every tool shares: the arguments naming a tab and a place in the song (1-based, as the window numbers them),
// checked against the song; the tab a tool reads or edits (the one named is shown first, so the edit is seen); and an
// edit run as the window runs it — the cursor placed (never an undo step), then one editor action (one undo step).

import { MAX_VOICES, type Song, type StringAddress } from '@gp-editor/core';
import { firstCursor } from '../../lib/navigation';
import type { EditorAction, EditorState } from '../../state/editor';
import type { DocumentTab, WorkspaceState } from '../../state/workspace';
import type { AppHost } from '../app-host';
import { beatAtJson } from '../bars-json';
import type { JsonObject } from '../json-rpc';
import type { JsonSchema } from '../json-schema';
import { cursorJson } from '../song-json';
import type { ToolArguments, ToolResult } from '../tool-types';

export const TAB_ARGUMENT: JsonSchema = { type: 'string', minLength: 1, maxLength: 32, description: 'A tab id from get_state ("tab-2"). Default: the shown tab.' };
export const TRACK_ARGUMENT: JsonSchema = { type: 'integer', minimum: 1, maximum: 999, description: 'Track number (1 = the first track). Default: the cursor’s track.' };
export const BAR_ARGUMENT: JsonSchema = { type: 'integer', minimum: 1, maximum: 99_999, description: 'Bar number (1 = the first bar).' };
export const BEAT_ARGUMENT: JsonSchema = { type: 'integer', minimum: 1, maximum: 999, description: 'Beat number in the bar (1 = its first beat, as get_bars lists them).' };
export const STRING_ARGUMENT: JsonSchema = { type: 'integer', minimum: 1, maximum: 12, description: 'String number (1 = the highest string).' };
export const VOICE_ARGUMENT: JsonSchema = { type: 'integer', minimum: 1, maximum: MAX_VOICES, description: 'Voice 1–4. Default: the cursor’s voice.' };

/** The arguments that place an edit: where the cursor goes first (each defaults to the cursor's). */
export const POSITION_ARGUMENTS: Readonly<Record<string, JsonSchema>> = {
  track: TRACK_ARGUMENT,
  bar: { ...BAR_ARGUMENT, description: 'Bar number (1 = the first bar). Default: the cursor’s bar.' },
  beat: { ...BEAT_ARGUMENT, description: 'Beat number in the bar (1 = its first beat). Default: the cursor’s beat, or 1 in another bar.' },
  voice: VOICE_ARGUMENT,
  tab: TAB_ARGUMENT,
};

/** An object schema that takes only the arguments it names. */
export function objectSchema(properties: Readonly<Record<string, JsonSchema>>, required: readonly string[] = []): JsonSchema {
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}), additionalProperties: false };
}

export function toolError(text: string): ToolResult {
  return { text, isError: true };
}

/** A tool's answer: its text, and its data (also as the text's second part, for clients that read only text). */
export function answer(text: string, structured?: JsonObject): ToolResult {
  return structured === undefined ? { text } : { text: `${text}\n${JSON.stringify(structured)}`, structured };
}

export function optionalInteger(args: ToolArguments, name: string): number | undefined {
  const value = args[name];
  return typeof value === 'number' ? value : undefined;
}

export function optionalString(args: ToolArguments, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' ? value : undefined;
}

/** A tab with a document, its editor and song; or why a tool cannot act. */
export type TabTarget = { readonly ok: true; readonly tab: DocumentTab; readonly editor: EditorState; readonly song: Song } | { readonly ok: false; readonly result: ToolResult };

/** The tab named by `tab` (or the shown one), with its document. */
export function readTab(workspace: WorkspaceState, tabId: string | undefined): TabTarget {
  const id = tabId ?? workspace.activeTabId;
  const tab = workspace.tabs.find((each) => each.id === id);
  if (tab === undefined) {
    const open = workspace.tabs.map((each) => each.id).join(', ');
    return { ok: false, result: toolError(id === undefined ? 'No document is open: call new_document or open_file first.' : `No tab "${id}". Open tabs: ${open || 'none'}.`) };
  }
  const song = tab.editor.document?.song;
  return song === undefined ? { ok: false, result: toolError(`Tab "${tab.id}" has no document yet.`) } : { ok: true, tab, editor: tab.editor, song };
}

/** The tab an edit goes to: the one named is shown first (an edit is seen as it happens), else the shown tab. */
export function editTab(host: AppHost, args: ToolArguments): TabTarget {
  const tabId = optionalString(args, 'tab');
  const workspace = host.workspace();
  const shown = tabId !== undefined && tabId !== workspace.activeTabId && workspace.tabs.some((tab) => tab.id === tabId) ? host.dispatch({ type: 'switchTab', tabId }) : workspace;
  return readTab(shown, tabId);
}

/** The tab's editor after actions went to it. */
export function editorIn(workspace: WorkspaceState, tabId: string): EditorState | undefined {
  return workspace.tabs.find((tab) => tab.id === tabId)?.editor;
}

function rangeProblem(name: string, value: number, count: number, where: string): string | undefined {
  return value >= 1 && value <= count ? undefined : `${name} ${value} does not exist: ${where} has ${count === 1 ? `one ${name}` : `${count} ${name}s`} (1–${count}).`;
}

/** Where the cursor goes: the position's fields over the cursor's (a new bar starts at its beat 1); or why it is nowhere in the song. */
export function addressAt(song: Song, editor: EditorState, args: ToolArguments): { readonly ok: true; readonly address: StringAddress } | { readonly ok: false; readonly problem: string } {
  const current = editor.cursor ?? firstCursor(song, editor.trackIndex) ?? { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };
  const trackNumber = optionalInteger(args, 'track') ?? current.trackIndex + 1;
  const barNumber = optionalInteger(args, 'bar') ?? current.measureIndex + 1;
  const isOtherBar = barNumber !== current.measureIndex + 1 || trackNumber !== current.trackIndex + 1;
  const beatNumber = optionalInteger(args, 'beat') ?? (isOtherBar ? 1 : current.beatIndex + 1);
  const track = song.tracks[trackNumber - 1];
  const stringNumber = optionalInteger(args, 'string') ?? Math.min(current.string, Math.max(1, track?.strings.length ?? 1));
  const beatCount = Math.max(1, track?.measures[barNumber - 1]?.beats.length ?? 0);
  const problem =
    rangeProblem('track', trackNumber, song.tracks.length, 'the song') ??
    rangeProblem('bar', barNumber, song.measureHeaders.length, 'the song') ??
    rangeProblem('beat', beatNumber, beatCount, `bar ${barNumber} of track ${trackNumber}`) ??
    rangeProblem('string', stringNumber, Math.max(1, track?.strings.length ?? 1), `track ${trackNumber}`);
  if (problem !== undefined) {
    return { ok: false, problem };
  }
  const voiceNumber = optionalInteger(args, 'voice') ?? current.voiceIndex + 1;
  return { ok: true, address: { trackIndex: trackNumber - 1, measureIndex: barNumber - 1, beatIndex: beatNumber - 1, voiceIndex: voiceNumber - 1, string: stringNumber } };
}

/** The cursor to `address` in a tab (no undo step), as a click on the score and ⌘1–⌘4 put it; the workspace after. */
export function placeCursor(host: AppHost, tabId: string, address: StringAddress): WorkspaceState {
  const placed = host.dispatch({ type: 'inTab', tabId, action: { type: 'placeCursor', cursor: address } });
  const cursor = editorIn(placed, tabId)?.cursor;
  return cursor === undefined || cursor.voiceIndex === address.voiceIndex ? placed : host.dispatch({ type: 'inTab', tabId, action: { type: 'selectVoice', voiceIndex: address.voiceIndex } });
}

/** What an edit did: the editor after it, and whether the song changed (one undo step) or why not. */
export interface EditOutcome {
  readonly editor: EditorState;
  readonly isChanged: boolean;
  readonly song: Song;
}

/** Places the cursor at the arguments' position, then runs `action` there; or why the position is no place in the song. */
export function editAt(host: AppHost, args: ToolArguments, action: EditorAction): { readonly ok: true; readonly outcome: EditOutcome } | { readonly ok: false; readonly result: ToolResult } {
  const target = editTab(host, args);
  if (!target.ok) {
    return target;
  }
  const place = addressAt(target.song, target.editor, args);
  if (!place.ok) {
    return { ok: false, result: toolError(place.problem) };
  }
  const tabId = target.tab.id;
  const before = editorIn(placeCursor(host, tabId, place.address), tabId)?.document?.song;
  const editor = editorIn(host.dispatch({ type: 'inTab', tabId, action }), tabId) ?? target.editor;
  const song = editor.document?.song ?? target.song;
  return { ok: true, outcome: { editor, isChanged: song !== before, song } };
}

/** "Nothing changed" with the window's own reason when it gave one (its hint strip's text). */
export function unchanged(editor: EditorState, fallback: string): ToolResult {
  return toolError(editor.hint === undefined ? fallback : `Nothing changed: ${editor.hint}`);
}

/** An answer with the cursor after the tool and the beat under it (in the cursor's voice). */
export function cursorAnswer(text: string, editor: EditorState): ToolResult {
  const { cursor } = editor;
  const song = editor.document?.song;
  if (cursor === undefined || song === undefined) {
    return answer(text);
  }
  const beat = beatAtJson(song, cursor);
  return answer(text, { cursor: cursorJson(cursor), ...(beat === undefined ? {} : { beat }) });
}
