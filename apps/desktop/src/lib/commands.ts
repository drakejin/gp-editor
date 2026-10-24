import { SCORE_MODES, SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import type { PanelId } from '../state/panels';
import { type Command, editorRow, keyRow, press, row } from './command-types';
import { PALETTE_COMMANDS } from './palette-commands';

export type { Command, CommandActions, CommandState } from './command-types';

const FILE_ROWS: readonly Command[] = [
  editorRow('file.new', 'File', 'New Score + Tab', { type: 'newFile', mode: 'notationAndTab' }, { when: 'always', shortcut: '⌘N', keywords: ['create', 'sheet', 'document'] }),
  editorRow('file.newScore', 'File', 'New Score', { type: 'newFile', mode: 'notation' }, { when: 'always', keywords: ['create', 'notation', 'standard'] }),
  editorRow('file.newTab', 'File', 'New Tab', { type: 'newFile', mode: 'tab' }, { when: 'always', keywords: ['create', 'tablature'] }),
  editorRow('file.open', 'File', 'Open…', { type: 'openFile' }, { when: 'always', shortcut: '⌘O', keywords: ['file', 'gp', 'gp5', 'load', 'musicxml', 'ptb', 'tef', 'midi'] }),
  row('file.recent', 'File', 'Recent Files…', (a) => a.openRecentFiles(), { when: 'always', keywords: ['open', 'recent', 'pinned', 'history'] }),
  editorRow('file.importPdf', 'File', 'Import PDF…', { type: 'importPdf' }, { when: 'always', shortcut: '⇧⌘I', keywords: ['transcribe', 'ai', 'claude', 'scan'] }),
  editorRow('file.save', 'File', 'Save', { type: 'saveFile' }, { shortcut: '⌘S', keywords: ['write'] }),
  row('file.saveAs', 'File', 'Save As…', (a) => a.save(true), { shortcut: '⇧⌘S', keywords: ['format', 'gp', 'gp5', 'gp4', 'gp3', 'copy'] }),
  editorRow('file.exportPdf', 'File', 'Export PDF…', { type: 'exportPdf' }, { shortcut: '⇧⌘E', keywords: ['print', 'paper', 'a4', 'letter'] }),
  row('file.exportPng', 'File', 'Export PNG…', (a) => a.exportPng(), { keywords: ['image', 'picture', 'dpi'] }),
  row('file.exportMidi', 'File', 'Export MIDI…', (a) => a.exportMidi(), { keywords: ['mid', 'smf'] }),
  row('file.exportAsciiTab', 'File', 'Export ASCII Tab…', (a) => a.exportAsciiTab(), { keywords: ['text', 'txt', 'plain'] }),
  row('file.exportMusicXml', 'File', 'Export MusicXML…', (a) => a.exportMusicXml(), { keywords: ['xml', 'musescore', 'sibelius', 'finale'] }),
  row('file.exportCompressedMusicXml', 'File', 'Export Compressed MusicXML…', (a) => a.exportCompressedMusicXml(), { keywords: ['mxl', 'xml', 'zip'] }),
  row('file.exportAudio', 'File', 'Export Audio…', (a) => a.exportAudio(), { keywords: ['wav', 'aiff', 'flac', 'mp3', 'ogg', 'vorbis', 'render', 'bounce', 'stems', 'sound'] }),
  row('file.print', 'File', 'Print…', (a) => a.print(), { shortcut: '⌘P', keywords: ['printer', 'paper'] }),
  row('file.closeTab', 'File', 'Close Tab', (a) => a.closeTab(), { shortcut: '⌘W', keywords: ['document', 'close'] }),
  row('file.nextTab', 'File', 'Next Tab', (a) => a.cycleTab(1), { when: 'tabs', shortcut: '⌃⇥', keywords: ['document', 'switch'] }),
  row('file.previousTab', 'File', 'Previous Tab', (a) => a.cycleTab(-1), { when: 'tabs', shortcut: '⌃⇧⇥', keywords: ['document', 'switch'] }),
];

const EDIT_ROWS: readonly Command[] = [
  keyRow('edit.undo', 'Edit', 'Undo', press('z', { metaKey: true }), { when: 'undo' }),
  keyRow('edit.redo', 'Edit', 'Redo', press('z', { metaKey: true, shiftKey: true }), { when: 'redo' }),
  keyRow('edit.copy', 'Edit', 'Copy the Selected Beats', press('c', { metaKey: true }), { when: 'beat', keywords: ['clipboard'] }),
  keyRow('edit.cut', 'Edit', 'Cut the Selected Beats', press('x', { metaKey: true }), { when: 'beat', keywords: ['clipboard', 'delete'] }),
  keyRow('edit.paste', 'Edit', 'Paste Beats', press('v', { metaKey: true }), { when: 'beat', keywords: ['clipboard', 'insert'] }),
  row('edit.lyrics', 'Edit', 'Lyrics…', (a) => a.openLyrics(), { keywords: ['words', 'syllables', 'sing'] }),
  row('edit.songWriter', 'Edit', 'Song Writer…', (a) => a.openSongWriter(), { when: 'always', keywords: ['ai', 'wizard', 'compose', 'claude', 'write'] }),
];

const PANEL_ROWS: readonly (readonly [PanelId, string, readonly string[]])[] = [
  ['palette', 'Edition Palette', ['tools', 'left']],
  ['inspector', 'Inspector', ['song', 'track', 'right', 'properties']],
  ['tracks', 'Tracks Panel', ['mixer', 'bar map', 'bottom']],
  ['keyboard', 'Piano Keyboard', ['keys', 'instrument']],
  ['neck', 'Fretboard', ['neck', 'instrument', 'guitar']],
  ['mixer', 'Mixer', ['effects', 'master', 'strips', 'reverb', 'drive', 'eq']],
];

const VIEW_ROWS: readonly Command[] = [
  ...SCORE_MODES.map((mode: ScoreMode) =>
    editorRow(`view.mode.${mode}`, 'View', `Show ${SCORE_MODE_LABELS[mode]}`, { type: 'setMode', mode }, { keywords: ['view', 'notation', 'tablature', 'staff'] }),
  ),
  keyRow('view.zoomIn', 'View', 'Zoom In', press('=', { metaKey: true }), { keywords: ['bigger', 'larger'] }),
  keyRow('view.zoomOut', 'View', 'Zoom Out', press('-', { metaKey: true }), { keywords: ['smaller'] }),
  ...PANEL_ROWS.map(([panel, name, keywords]) => row(`view.panel.${panel}`, 'View', `Show or Hide the ${name}`, (a) => a.togglePanel(panel), { keywords: ['panel', 'toggle', ...keywords] })),
  editorRow('view.multitrack', 'View', 'Multitrack', { type: 'toggleMultitrack' }, { shortcut: 'F3', keywords: ['all tracks', 'tracks', 'staves', 'system', 'show'] }),
  row('view.focus', 'View', 'Focus / Unfocus', (a) => a.toggleFocus(), { shortcut: '⇧⌘F', keywords: ['hide panels', 'score only', 'distraction'] }),
];

const TOOLS_ROWS: readonly Command[] = [
  row('tools.tuner', 'Tools', 'Tuner…', (a) => a.openTuner(), { when: 'always', keywords: ['tune', 'microphone', 'pitch', 'strings'] }),
  row('tools.scales', 'Tools', 'Scales…', (a) => a.openScales(), { when: 'always', keywords: ['scale', 'mode', 'finder', 'boxes', 'key'] }),
  row('tools.transpose', 'Tools', 'Transpose…', (a) => a.openTranspose(), { keywords: ['key', 'semitone', 'pitch', 'diatonic', 'chromatic', 'octave', 'chords'] }),
  row('tools.lineIn', 'Tools', 'Line In…', (a) => a.openLineIn(), { keywords: ['guitar', 'input', 'microphone', 'interface', 'sound lock', 'effects', 'amp'] }),
  row('tools.instrument', 'Tools', 'Instrument…', (a) => a.pickInstrument(), { when: 'pitched', keywords: ['sound', 'program', 'patch', 'general midi'] }),
];

const TRACK_ROWS: readonly Command[] = [
  row('track.addAudioTrack', 'Track', 'Add Audio Track…', (a) => a.addAudioTrack(), { keywords: ['backing track', 'recording', 'audio', 'mp3', 'wav', 'sync'] }),
  editorRow('track.removeAudioTrack', 'Track', 'Remove the Audio Track', { type: 'setAudioTrack', audioTrack: undefined }, { keywords: ['backing track', 'recording', 'audio'] }),
  keyRow('track.syncBar', 'Track', 'Sync the Cursor’s Bar to the Recording Now', press('y'), { keywords: ['audio', 'sync point', 'tap', 'backing track'] }),
  editorRow('track.tempoFromAudio', 'Track', 'Tempo From the Audio Track’s Sync Points', { type: 'setTempoFromAudio' }, { keywords: ['audio', 'bpm', 'sync point', 'recording'] }),
];

const NOTE_ROWS: readonly Command[] = [
  keyRow('note.letRing', 'Note', 'Let Ring', press('r'), { when: 'note' }),
  keyRow('note.slide', 'Note', 'Slide', press('s'), { when: 'note' }),
  keyRow('note.hammer', 'Note', 'Hammer-On / Pull-Off', press('h'), { when: 'note', keywords: ['legato'] }),
  keyRow('note.palmMute', 'Note', 'Palm Mute', press('m'), { when: 'note' }),
  keyRow('note.dead', 'Note', 'Dead (Muted) Note', press('x'), { when: 'note' }),
  keyRow('note.ghost', 'Note', 'Ghost Note', press('g'), { when: 'note' }),
  keyRow('note.accent', 'Note', 'Accent', press('a'), { when: 'note' }),
  keyRow('note.harmonic', 'Note', 'Natural Harmonic', press('n'), { when: 'note' }),
  keyRow('note.tie', 'Note', 'Tie to the Previous Note', press('t'), { when: 'note' }),
  keyRow('note.vibrato', 'Note', 'Vibrato…', press('b'), { when: 'note', keywords: ['wide', 'slight'] }),
  keyRow('note.bend', 'Note', 'Bend…', press('c'), { when: 'note', keywords: ['choke', 'release'] }),
  keyRow('note.fretUp', 'Note', 'Fret Up', press('='), { when: 'note', keywords: ['higher', 'semitone'] }),
  keyRow('note.fretDown', 'Note', 'Fret Down', press('-'), { when: 'note', keywords: ['lower', 'semitone'] }),
  keyRow('note.stringUp', 'Note', 'Move the Note to the String Above', press('ArrowUp', { altKey: true }), { when: 'note' }),
  keyRow('note.stringDown', 'Note', 'Move the Note to the String Below', press('ArrowDown', { altKey: true }), { when: 'note' }),
  keyRow('note.erase', 'Note', 'Note to Rest; on a Rest, Remove It', press('Backspace'), { when: 'beat', keywords: ['delete', 'erase'] }),
];

const BEAT_ROWS: readonly Command[] = [
  keyRow('beat.delete', 'Beat', 'Delete the Beat', press('Backspace', { shiftKey: true }), { when: 'beat' }),
  keyRow('beat.insert', 'Beat', 'Insert a Beat After the Cursor', press('i'), { when: 'beat' }),
  keyRow('beat.chord', 'Beat', 'Chord Diagram…', press('k'), { when: 'beat', keywords: ['chord', 'library', 'grid', 'name'] }),
  keyRow('beat.longer', 'Beat', 'Longer Note Value', press('[', { altKey: true }), { when: 'beat', keywords: ['duration'] }),
  keyRow('beat.shorter', 'Beat', 'Shorter Note Value', press(']', { altKey: true }), { when: 'beat', keywords: ['duration'] }),
  keyRow('beat.dotted', 'Beat', 'Dotted', press('.'), { when: 'beat', keywords: ['dot', 'duration'] }),
  keyRow('beat.triplet', 'Beat', 'Triplet', press('/'), { when: 'beat', keywords: ['tuplet'] }),
  keyRow('beat.innerTriplet', 'Beat', 'Triplet Inside the Beat’s Tuplet', press('/', { altKey: true }), { when: 'beat', keywords: ['nested', 'tuplet'] }),
];

const GO_ROWS: readonly Command[] = [
  keyRow('go.previousBeat', 'Go', 'Previous Beat', press('ArrowLeft'), { keywords: ['cursor', 'left'] }),
  keyRow('go.nextBeat', 'Go', 'Next Beat', press('ArrowRight'), { keywords: ['cursor', 'right'] }),
  keyRow('go.stringAbove', 'Go', 'String Above', press('ArrowUp'), { keywords: ['cursor', 'up'] }),
  keyRow('go.stringBelow', 'Go', 'String Below', press('ArrowDown'), { keywords: ['cursor', 'down'] }),
  keyRow('go.previousTrack', 'Go', 'Previous Track', press('ArrowUp', { metaKey: true }), { keywords: ['track', 'staff', 'up', 'multitrack'] }),
  keyRow('go.nextTrack', 'Go', 'Next Track', press('ArrowDown', { metaKey: true }), { keywords: ['track', 'staff', 'down', 'multitrack'] }),
  keyRow('go.previousBar', 'Go', 'Previous Bar', press('ArrowLeft', { altKey: true }), { keywords: ['measure'] }),
  keyRow('go.nextBar', 'Go', 'Next Bar', press('ArrowRight', { altKey: true }), { keywords: ['measure'] }),
  keyRow('go.firstBar', 'Go', 'First Bar', press('Home'), { keywords: ['start', 'beginning'] }),
  keyRow('go.lastBar', 'Go', 'Last Bar', press('End'), { keywords: ['end'] }),
  keyRow('go.selectPrevious', 'Go', 'Select the Previous Beat Too', press('ArrowLeft', { shiftKey: true }), { keywords: ['selection', 'extend'] }),
  keyRow('go.selectNext', 'Go', 'Select the Next Beat Too', press('ArrowRight', { shiftKey: true }), { keywords: ['selection', 'extend'] }),
];

const PLAYBACK_ROWS: readonly Command[] = [
  keyRow('play.toggle', 'Playback', 'Play / Stop', press(' '), { keywords: ['start', 'listen'] }),
  keyRow('play.faster', 'Playback', 'Playback Tempo +5 BPM', press(']'), { keywords: ['speed', 'faster'] }),
  keyRow('play.slower', 'Playback', 'Playback Tempo −5 BPM', press('['), { keywords: ['speed', 'slower'] }),
  row('play.loop', 'Playback', 'Loop On / Off', (a) => a.toggleLoop(), { keywords: ['repeat', 'practice', 'bars'] }),
  keyRow('play.speedUp', 'Playback', 'Playback Speed +5%', press('=', { altKey: true }), { keywords: ['faster', 'percent', 'relative'] }),
  keyRow('play.speedDown', 'Playback', 'Playback Speed −5%', press('-', { altKey: true }), { keywords: ['slower', 'percent', 'relative'] }),
  keyRow('play.metronome', 'Playback', 'Metronome On / Off', press('m', { altKey: true }), { keywords: ['click', 'beat', 'practice'] }),
  keyRow('play.countIn', 'Playback', 'Count-In On / Off', press('c', { altKey: true }), { keywords: ['click', 'bar', 'practice'] }),
  keyRow('play.tempoLock', 'Playback', 'Tempo Lock On / Off', press('l', { altKey: true }), { keywords: ['fixed', 'one tempo', 'practice'] }),
  row('play.previewOnHover', 'Playback', 'Preview Notes on Hover', (a) => a.togglePreviewOnHover(), { keywords: ['hear', 'piano', 'fretboard', 'sound'] }),
];

const HELP_ROWS: readonly Command[] = [row('help.shortcuts', 'Help', 'Keyboard Shortcuts', (a) => a.openShortcuts(), { when: 'always', shortcut: '⌘H', keywords: ['keys', 'help', 'cheat sheet'] })];

/** The menus' commands, the panels, and every key of the editor. */
export const APP_COMMANDS: readonly Command[] = [
  ...FILE_ROWS,
  ...EDIT_ROWS,
  ...VIEW_ROWS,
  ...TOOLS_ROWS,
  ...TRACK_ROWS,
  ...NOTE_ROWS,
  ...BEAT_ROWS,
  ...GO_ROWS,
  ...PLAYBACK_ROWS,
  ...HELP_ROWS,
];

/** Same command, same row: a palette tool that does what a key does is listed once, with the key. */
function commandKey(command: Command): string | undefined {
  return command.command === undefined ? undefined : JSON.stringify(command.command);
}

/**
 * Every command of the command palette (⇧⌘P), in the order it lists them before anything is typed: the menus' commands
 * (File, Edit, View, Tools), the panels, the editor's keys, then the edition palette's tools.
 */
export const COMMANDS: readonly Command[] = (() => {
  const taken = new Set(APP_COMMANDS.map(commandKey).filter((key) => key !== undefined));
  return [...APP_COMMANDS, ...PALETTE_COMMANDS.filter((command) => !taken.has(commandKey(command) ?? ''))];
})();
