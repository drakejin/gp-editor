import { SCORE_MODES, type ScoreMode } from '../score/geometry';
import type { AppCommand } from '../state/app-command';
import type { McpServerCommand } from '../native/mcp-server';
import type { PanelId } from '../state/panels';
import { type Command, type CommandActions, type RowSpec, editorRow, keyRow, press, row } from './command-types';
import { type MessageKey, currentLanguage, isMessageKey, memoByLanguage, t, translate } from './i18n/i18n';
import { KEYS, type KeyCommand, type KeyPress } from './key-commands';
import { paletteToolCommands } from './palette-commands';

/** Where a registry command lives: a menu (File, Edit, View, Tools, Track, Help) or a part of the editor. */
type GroupId = 'app' | 'file' | 'edit' | 'view' | 'tools' | 'track' | 'note' | 'beat' | 'go' | 'playback' | 'help';

/** A registry command's title key: "commands.title.<id>" (the catalogue test checks every row has one). */
function titleKey(id: string): MessageKey | undefined {
  const key = `commands.title.${id}`;
  return isMessageKey(key) ? key : undefined;
}

function commandTitle(id: string): string {
  const key = titleKey(id);
  return key === undefined ? id : t(key);
}

/** Outside English, a command is found by its English title and group too (“transpose” finds 조옮김…). */
function searchSpec(id: string, group: GroupId, spec: RowSpec): RowSpec {
  const key = titleKey(id);
  if (currentLanguage() === 'en' || key === undefined) {
    return spec;
  }
  return { ...spec, keywords: [...(spec.keywords ?? []), translate('en', key), translate('en', `commands.group.${group}`)] };
}

function appRow(id: string, group: GroupId, run: (actions: CommandActions) => void, spec: RowSpec = {}): Command {
  return row(id, t(`commands.group.${group}`), commandTitle(id), run, searchSpec(id, group, spec));
}

function appEditorRow(id: string, group: GroupId, command: AppCommand | KeyCommand, spec: RowSpec = {}): Command {
  return editorRow(id, t(`commands.group.${group}`), commandTitle(id), command, searchSpec(id, group, spec));
}

function appKeyRow(id: string, group: GroupId, keyPress: KeyPress, spec: RowSpec = {}): Command {
  return keyRow(id, t(`commands.group.${group}`), commandTitle(id), keyPress, searchSpec(id, group, spec));
}

const fileRows = (): readonly Command[] => [
  appEditorRow('file.new', 'file', { type: 'newFile', mode: 'notationAndTab' }, { when: 'always', shortcut: '⌘N', keywords: ['create', 'sheet', 'document'] }),
  appEditorRow('file.newScore', 'file', { type: 'newFile', mode: 'notation' }, { when: 'always', keywords: ['create', 'notation', 'standard'] }),
  appEditorRow('file.newTab', 'file', { type: 'newFile', mode: 'tab' }, { when: 'always', keywords: ['create', 'tablature'] }),
  appEditorRow('file.open', 'file', { type: 'openFile' }, { when: 'always', shortcut: '⌘O', keywords: ['file', 'gp', 'gp5', 'load', 'musicxml', 'ptb', 'tef', 'midi'] }),
  appRow('file.recent', 'file', (a) => a.openRecentFiles(), { when: 'always', keywords: ['open', 'recent', 'pinned', 'history'] }),
  appEditorRow('file.importPdf', 'file', { type: 'importPdf' }, { when: 'always', shortcut: '⇧⌘I', keywords: ['transcribe', 'ai', 'claude', 'scan'] }),
  appEditorRow('file.save', 'file', { type: 'saveFile' }, { shortcut: '⌘S', keywords: ['write'] }),
  appRow('file.saveAs', 'file', (a) => a.save(true), { shortcut: '⇧⌘S', keywords: ['format', 'gp', 'gp5', 'gp4', 'gp3', 'copy'] }),
  appEditorRow('file.exportPdf', 'file', { type: 'exportPdf' }, { shortcut: '⇧⌘E', keywords: ['print', 'paper', 'a4', 'letter'] }),
  appRow('file.exportPng', 'file', (a) => a.exportPng(), { keywords: ['image', 'picture', 'dpi'] }),
  appRow('file.exportMidi', 'file', (a) => a.exportMidi(), { keywords: ['mid', 'smf'] }),
  appRow('file.exportAsciiTab', 'file', (a) => a.exportAsciiTab(), { keywords: ['text', 'txt', 'plain'] }),
  appRow('file.exportMusicXml', 'file', (a) => a.exportMusicXml(), { keywords: ['xml', 'musescore', 'sibelius', 'finale'] }),
  appRow('file.exportCompressedMusicXml', 'file', (a) => a.exportCompressedMusicXml(), { keywords: ['mxl', 'xml', 'zip'] }),
  appRow('file.exportAudio', 'file', (a) => a.exportAudio(), { keywords: ['wav', 'aiff', 'flac', 'mp3', 'ogg', 'vorbis', 'render', 'bounce', 'stems', 'sound'] }),
  appRow('file.stylesheet', 'file', (a) => a.openStylesheet(), {
    shortcut: 'F7',
    keywords: ['page', 'paper', 'format', 'margins', 'fonts', 'text', 'spacing', 'scale', 'bars', 'system', 'lyrics', 'numbers', 'style', 'layout'],
  }),
  appRow('file.print', 'file', (a) => a.print(), { shortcut: '⌘P', keywords: ['printer', 'paper'] }),
  appRow('file.closeTab', 'file', (a) => a.closeTab(), { shortcut: '⌘W', keywords: ['document', 'close'] }),
  appRow('file.nextTab', 'file', (a) => a.cycleTab(1), { when: 'tabs', shortcut: '⌃⇥', keywords: ['document', 'switch'] }),
  appRow('file.previousTab', 'file', (a) => a.cycleTab(-1), { when: 'tabs', shortcut: '⌃⇧⇥', keywords: ['document', 'switch'] }),
];

const editRows = (): readonly Command[] => [
  appKeyRow('edit.undo', 'edit', press('z', { metaKey: true }), { when: 'undo' }),
  appKeyRow('edit.redo', 'edit', press('z', { metaKey: true, shiftKey: true }), { when: 'redo' }),
  appKeyRow('edit.copy', 'edit', press('c', { metaKey: true }), { when: 'beat', keywords: ['clipboard'] }),
  appKeyRow('edit.cut', 'edit', press('x', { metaKey: true }), { when: 'beat', keywords: ['clipboard', 'delete'] }),
  appKeyRow('edit.paste', 'edit', press('v', { metaKey: true }), { when: 'beat', keywords: ['clipboard', 'insert'] }),
  appKeyRow('edit.deleteNotes', 'edit', press('d'), { when: 'notes', keywords: ['erase', 'remove', 'clear', 'rests', 'selection'] }),
  appKeyRow('edit.deleteBars', 'edit', press('d', { metaKey: true }), { when: 'bar', keywords: ['measures', 'remove', 'selection'] }),
  ...[1, 2, 3, 4].map((number) => appKeyRow(`edit.voice${number}`, 'edit', press(String(number), { metaKey: true }), { when: 'beat', keywords: ['voice', 'polyphony', 'multivoice'] })),
  ...[1, 2, 3, 4].map((number) => appKeyRow(`edit.moveToVoice${number}`, 'edit', press(String(number), { altKey: true }), { when: 'beat', keywords: ['voice', 'move', 'note', 'polyphony'] })),
  appEditorRow('edit.multivoice', 'edit', { type: 'toggleMultivoice' }, { when: 'beat', keywords: ['voice', 'all', 'voices', 'polyphony', 'fade'] }),
  appRow('edit.lyrics', 'edit', (a) => a.openLyrics(), { keywords: ['words', 'syllables', 'sing'] }),
  appRow('edit.songWriter', 'edit', (a) => a.openSongWriter(), { when: 'always', keywords: ['ai', 'wizard', 'compose', 'claude', 'write'] }),
];

/** The panels View shows or hides, and more words each is found by. */
const PANEL_ROWS: readonly (readonly [PanelId, readonly string[]])[] = [
  ['palette', ['tools', 'left']],
  ['inspector', ['song', 'track', 'right', 'properties']],
  ['tracks', ['mixer', 'bar', 'map', 'bottom']],
  ['keyboard', ['keys', 'instrument']],
  ['neck', ['neck', 'instrument', 'guitar']],
  ['mixer', ['effects', 'master', 'strips', 'reverb', 'drive', 'eq']],
];

const viewRows = (): readonly Command[] => [
  ...SCORE_MODES.map((mode: ScoreMode) =>
    appEditorRow(`view.mode.${mode}`, 'view', { type: 'setMode', mode }, { keywords: ['view', 'notation', 'tablature', 'staff'] }),
  ),
  appKeyRow('view.zoomIn', 'view', press('=', { metaKey: true }), { keywords: ['bigger', 'larger'] }),
  appKeyRow('view.zoomOut', 'view', press('-', { metaKey: true }), { keywords: ['smaller', 'more', 'systems', 'lines'] }),
  appKeyRow('view.zoomActual', 'view', press('0', { metaKey: true }), { keywords: ['100', 'reset', 'normal', 'zoom'] }),
  appEditorRow('view.fitWidth', 'view', { type: 'zoomTo', zoom: 'fitWidth' }, { keywords: ['zoom', 'page', 'print', 'lines', 'width'] }),
  appEditorRow('view.fitPage', 'view', { type: 'zoomTo', zoom: 'fitPage' }, { keywords: ['zoom', 'page', 'print', 'whole', 'systems', 'density'] }),
  ...PANEL_ROWS.map(([panel, keywords]) => appRow(`view.panel.${panel}`, 'view', (a) => a.togglePanel(panel), { keywords: ['panel', 'toggle', ...keywords] })),
  appEditorRow('view.multitrack', 'view', { type: 'toggleMultitrack' }, { shortcut: 'F3', keywords: ['all', 'tracks', 'staves', 'system', 'show'] }),
  appRow('view.focus', 'view', (a) => a.toggleFocus(), { shortcut: '⇧⌘F', keywords: ['hide', 'panels', 'score', 'only', 'distraction'] }),
  appEditorRow('view.designMode', 'view', { type: 'toggleDesignMode' }, { keywords: ['layout', 'beat', 'position', 'bar', 'width', 'spacing', 'systems', 'guideline', 'drag'] }),
  appEditorRow('view.resetPositions', 'view', { type: 'resetPositions' }, { keywords: ['design', 'spacing', 'tools', 'layout', 'bar', 'width', 'beat', 'position', 'systems'] }),
  appRow('view.drumKey', 'view', (a) => a.toggleDrumKey(), { keywords: ['drums', 'drumset', 'legend', 'noteheads', 'kit', 'percussion', 'hi-hat', 'cymbal'] }),
];

/** Tools ▸ MCP Server's items (the menu bar item has them too), and more words each is found by. */
const MCP_SERVER_ROWS: readonly (readonly [string, McpServerCommand, readonly string[]])[] = [
  ['tools.mcpServerSettings', 'settings', ['port', 'menu', 'bar', 'automation']],
  ['tools.mcpServerLog', 'log', ['requests', 'clients', 'history']],
  ['tools.mcpServerRestart', 'restart', ['start', 'stop']],
  ['tools.mcpServerSetupCommand', 'copySetupCommand', ['code', 'connect', 'url', 'copy', 'terminal']],
];

const toolsRows = (): readonly Command[] => [
  appRow('tools.tuner', 'tools', (a) => a.openTuner(), { when: 'always', keywords: ['tune', 'microphone', 'pitch', 'strings'] }),
  appRow('tools.scales', 'tools', (a) => a.openScales(), { when: 'always', keywords: ['scale', 'mode', 'finder', 'boxes', 'key'] }),
  appRow('tools.transpose', 'tools', (a) => a.openTranspose(), { keywords: ['key', 'semitone', 'pitch', 'diatonic', 'chromatic', 'octave', 'chords'] }),
  appRow('tools.lineIn', 'tools', (a) => a.openLineIn(), { keywords: ['guitar', 'input', 'microphone', 'interface', 'sound', 'lock', 'effects', 'amp'] }),
  appRow('tools.expressionText', 'tools', (a) => a.openExpressionText(), {
    shortcut: '⌥⌘E',
    keywords: ['chord', 'dynamic', 'key', 'signature', 'octave', '8va', 'clef', 'direction', 'coda', 'type', '>'],
  }),
  appRow('tools.instrument', 'tools', (a) => a.pickInstrument(), { when: 'pitched', keywords: ['sound', 'program', 'patch', 'general', 'midi'] }),
  ...MCP_SERVER_ROWS.map(([id, command, keywords]) => appRow(id, 'tools', (a) => a.runMcpServerCommand(command), { when: 'always', keywords: ['mcp', 'server', 'claude', 'ai', ...keywords] })),
];

const trackRows = (): readonly Command[] => [
  appRow('track.add', 'track', (a) => a.runTrackCommand('add'), { shortcut: '⌥⌘N', keywords: ['new', 'track', 'instrument', 'guitar', 'bass', 'drums', 'piano', 'ukulele', 'banjo'] }),
  appRow('track.duplicate', 'track', (a) => a.runTrackCommand('duplicate'), { keywords: ['copy', 'clone'] }),
  appRow('track.delete', 'track', (a) => a.runTrackCommand('delete'), { shortcut: '⌥⌘R', keywords: ['remove'] }),
  appRow('track.moveUp', 'track', (a) => a.runTrackCommand('moveUp'), { keywords: ['order', 'reorder'] }),
  appRow('track.moveDown', 'track', (a) => a.runTrackCommand('moveDown'), { keywords: ['order', 'reorder'] }),
  appRow('track.addAudioTrack', 'track', (a) => a.addAudioTrack(), { keywords: ['backing', 'track', 'recording', 'audio', 'mp3', 'wav', 'sync'] }),
  appEditorRow('track.removeAudioTrack', 'track', { type: 'setAudioTrack', audioTrack: undefined }, { keywords: ['backing', 'track', 'recording', 'audio'] }),
  appKeyRow('track.syncBar', 'track', press('y'), { keywords: ['audio', 'sync', 'point', 'tap', 'backing', 'track'] }),
  appEditorRow('track.tempoFromAudio', 'track', { type: 'setTempoFromAudio' }, { keywords: ['audio', 'bpm', 'sync', 'point', 'recording'] }),
];

const noteRows = (): readonly Command[] => [
  appKeyRow('note.letRing', 'note', press('r'), { when: 'note' }),
  appKeyRow('note.slide', 'note', press('s'), { when: 'note' }),
  appKeyRow('note.hammer', 'note', press('h'), { when: 'note', keywords: ['legato'] }),
  appKeyRow('note.palmMute', 'note', press('m'), { when: 'note' }),
  appKeyRow('note.dead', 'note', press('x'), { when: 'note' }),
  appKeyRow('note.ghost', 'note', press('g'), { when: 'note' }),
  appKeyRow('note.accent', 'note', press('a'), { when: 'note' }),
  appKeyRow('note.harmonic', 'note', press('n'), { when: 'note' }),
  appKeyRow('note.tie', 'note', press('t'), { when: 'note' }),
  appKeyRow('note.vibrato', 'note', press('b'), { when: 'note', keywords: ['wide', 'slight'] }),
  appKeyRow('note.bend', 'note', press('c'), { when: 'note', keywords: ['choke', 'release'] }),
  appKeyRow('note.fretUp', 'note', press('='), { when: 'note', keywords: ['higher', 'semitone'] }),
  appKeyRow('note.fretDown', 'note', press('-'), { when: 'note', keywords: ['lower', 'semitone'] }),
  appKeyRow('note.stringUp', 'note', press(KEYS.arrowUp, { altKey: true }), { when: 'note' }),
  appKeyRow('note.stringDown', 'note', press(KEYS.arrowDown, { altKey: true }), { when: 'note' }),
  appKeyRow('note.erase', 'note', press(KEYS.backspace), { when: 'beat', keywords: ['delete', 'erase'] }),
];

const beatRows = (): readonly Command[] => [
  appKeyRow('beat.delete', 'beat', press(KEYS.backspace, { shiftKey: true }), { when: 'beat' }),
  appKeyRow('beat.insert', 'beat', press('i'), { when: 'beat' }),
  appKeyRow('beat.chord', 'beat', press('k'), { when: 'beat', keywords: ['chord', 'library', 'grid', 'name'] }),
  appKeyRow('beat.longer', 'beat', press('[', { altKey: true }), { when: 'beat', keywords: ['duration'] }),
  appKeyRow('beat.shorter', 'beat', press(']', { altKey: true }), { when: 'beat', keywords: ['duration'] }),
  appKeyRow('beat.dotted', 'beat', press('.'), { when: 'beat', keywords: ['dot', 'duration'] }),
  appKeyRow('beat.triplet', 'beat', press('/'), { when: 'beat', keywords: ['tuplet'] }),
  appKeyRow('beat.innerTriplet', 'beat', press('/', { altKey: true }), { when: 'beat', keywords: ['nested', 'tuplet'] }),
];

const goRows = (): readonly Command[] => [
  appKeyRow('go.previousBeat', 'go', press(KEYS.arrowLeft), { keywords: ['cursor', 'left'] }),
  appKeyRow('go.nextBeat', 'go', press(KEYS.arrowRight), { keywords: ['cursor', 'right'] }),
  appKeyRow('go.stringAbove', 'go', press(KEYS.arrowUp), { keywords: ['cursor', 'up'] }),
  appKeyRow('go.stringBelow', 'go', press(KEYS.arrowDown), { keywords: ['cursor', 'down'] }),
  appKeyRow('go.previousTrack', 'go', press(KEYS.arrowUp, { metaKey: true }), { keywords: ['track', 'staff', 'up', 'multitrack'] }),
  appKeyRow('go.nextTrack', 'go', press(KEYS.arrowDown, { metaKey: true }), { keywords: ['track', 'staff', 'down', 'multitrack'] }),
  appKeyRow('go.previousBar', 'go', press(KEYS.arrowLeft, { altKey: true }), { keywords: ['measure'] }),
  appKeyRow('go.nextBar', 'go', press(KEYS.arrowRight, { altKey: true }), { keywords: ['measure'] }),
  appKeyRow('go.firstBar', 'go', press(KEYS.home), { keywords: ['start', 'beginning'] }),
  appKeyRow('go.lastBar', 'go', press(KEYS.end), { keywords: ['end'] }),
  appKeyRow('go.selectPrevious', 'go', press(KEYS.arrowLeft, { shiftKey: true }), { keywords: ['selection', 'extend'] }),
  appKeyRow('go.selectNext', 'go', press(KEYS.arrowRight, { shiftKey: true }), { keywords: ['selection', 'extend'] }),
];

const playbackRows = (): readonly Command[] => [
  appKeyRow('play.toggle', 'playback', press(' '), { keywords: ['start', 'listen'] }),
  appKeyRow('play.faster', 'playback', press(']'), { keywords: ['speed', 'faster'] }),
  appKeyRow('play.slower', 'playback', press('['), { keywords: ['speed', 'slower'] }),
  appRow('play.loop', 'playback', (a) => a.toggleLoop(), { keywords: ['repeat', 'practice', 'bars'] }),
  appKeyRow('play.speedUp', 'playback', press('=', { altKey: true }), { keywords: ['faster', 'percent', 'relative'] }),
  appKeyRow('play.speedDown', 'playback', press('-', { altKey: true }), { keywords: ['slower', 'percent', 'relative'] }),
  appKeyRow('play.metronome', 'playback', press('m', { altKey: true }), { keywords: ['click', 'beat', 'practice'] }),
  appKeyRow('play.countIn', 'playback', press('c', { altKey: true }), { keywords: ['click', 'bar', 'practice'] }),
  appKeyRow('play.tempoLock', 'playback', press('l', { altKey: true }), { keywords: ['fixed', 'one', 'tempo', 'practice'] }),
  appRow('play.previewOnHover', 'playback', (a) => a.togglePreviewOnHover(), { keywords: ['hear', 'piano', 'fretboard', 'sound'] }),
];

const helpRows = (): readonly Command[] => [appRow('help.shortcuts', 'help', (a) => a.openShortcuts(), { when: 'always', shortcut: '⌘H', keywords: ['keys', 'help', 'cheat', 'sheet'] })];

/** GP Editor ▸ Settings… (⌘,): language, interface contrast, score paper. */
const appSettingsRows = (): readonly Command[] => [
  appRow('app.settings', 'app', (a) => a.openSettings(), { when: 'always', shortcut: '⌘,', keywords: ['preferences', 'language', 'korean', 'english', 'contrast', 'dark', 'light', 'paper', 'theme', 'colors'] }),
];

/** The menus' commands, the panels, and every key of the editor, in the shown language. */
export const appCommands = memoByLanguage((): readonly Command[] => [
  ...fileRows(),
  ...editRows(),
  ...viewRows(),
  ...toolsRows(),
  ...trackRows(),
  ...noteRows(),
  ...beatRows(),
  ...goRows(),
  ...playbackRows(),
  ...helpRows(),
  ...appSettingsRows(),
]);

/** Same command, same row: a palette tool that does what a key does is listed once, with the key. */
function commandKey(command: Command): string | undefined {
  return command.command === undefined ? undefined : JSON.stringify(command.command);
}

/**
 * Every command of the command palette (⇧⌘P), in the order it lists them before anything is typed: the menus' commands
 * (File, Edit, View, Tools), the panels, the editor's keys, then the edition palette's tools — in the shown language,
 * built again after a language change (call it where the list is used).
 */
export const allCommands = memoByLanguage((): readonly Command[] => {
  const app = appCommands();
  const taken = new Set(app.map(commandKey).filter((key) => key !== undefined));
  return [...app, ...paletteToolCommands().filter((command) => !taken.has(commandKey(command) ?? ''))];
});
