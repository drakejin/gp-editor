import { type Song, type WritableFormat, isDefaultMaster } from '@gp-editor/core';
import { withoutExtension } from './file-name';
import { type MessageKey, t } from './i18n/i18n';

/**
 * A format with its note read when it is shown (a getter, so the save panel's message and the hint come in the language
 * shown then; a spread copy keeps the text of that moment).
 */
function withNote<T extends object>(format: T, key: MessageKey): T & { readonly note: string } {
  return Object.defineProperty({ ...format }, 'note', { enumerable: true, get: () => t(key) }) as T & { readonly note: string };
}

/** A format whose popup label has words to translate ("ASCII tab (.txt)"), read the same way. */
function withLabel<T extends object>(format: T, key: MessageKey): T & { readonly label: string } {
  return Object.defineProperty({ ...format }, 'label', { enumerable: true, get: () => t(key) }) as T & { readonly label: string };
}

/** A kind of file a save panel offers: the popup's label and the extension the file gets. */
export interface FileFormat {
  readonly id: string;
  readonly label: string;
  /** Without the dot. */
  readonly extension: string;
  /**
   * What the file keeps and leaves out: the save panel's message, and for a Guitar Pro format the hint bar's when it is
   * written. None for GP5, which holds what the editor edits but voices 3 and 4 (`saveHint` says so when they play).
   */
  readonly note?: string;
}

/** A Guitar Pro format gp-core writes. */
export interface SaveFormat extends FileFormat {
  readonly id: WritableFormat;
}

/**
 * Save As's format popup and the formats plain Save keeps a file in; the first one is the default. A format gp-core
 * learns to write is one more row.
 */
export const SAVE_FORMATS: readonly [SaveFormat, ...SaveFormat[]] = [
  // i18n-exempt: format names
  { id: 'gp5', label: 'Guitar Pro 5 (.gp5)', extension: 'gp5' },
  // i18n-exempt: format names
  withNote<SaveFormat>({ id: 'gp', label: 'Guitar Pro 7/8 (.gp)', extension: 'gp' }, 'window.format.gp.note'),
  // i18n-exempt: format names
  withNote<SaveFormat>({ id: 'gp4', label: 'Guitar Pro 4 (.gp4)', extension: 'gp4' }, 'window.format.gp4.note'),
  // i18n-exempt: format names
  withNote<SaveFormat>({ id: 'gp3', label: 'Guitar Pro 3 (.gp3)', extension: 'gp3' }, 'window.format.gp3.note'),
];

/** File ▸ Export MIDI…: a Standard MIDI File of the song as playback plays it. */
// i18n-exempt: format names
export const MIDI_FILE: FileFormat = withNote({ id: 'mid', label: 'MIDI (.mid)', extension: 'mid' }, 'window.format.midi.note');

/** File ▸ Export ASCII Tab…: plain UTF-8 text. */
export const ASCII_TAB_FILE: FileFormat = withLabel(withNote({ id: 'txt', extension: 'txt' }, 'window.format.asciiTab.note'), 'window.format.asciiTab.label');

/** File ▸ Export MusicXML…: MusicXML 4.0 as UTF-8 text, for other notation programs. */
// i18n-exempt: format names
export const MUSICXML_FILE: FileFormat = withNote({ id: 'musicxml', label: 'MusicXML (.musicxml)', extension: 'musicxml' }, 'window.format.musicXml.note');

/** File ▸ Export Compressed MusicXML…: the same score zipped. */
export const MXL_FILE: FileFormat = withLabel(withNote({ id: 'mxl', extension: 'mxl' }, 'window.format.mxl.note'), 'window.format.mxl.label');

/** Only .gp files keep the app's playback effects (gp-core's songEffectsToJson, an entry of the zip). */
function hasEffects(song: Song): boolean {
  return song.tracks.some((track) => (track.effects?.length ?? 0) > 0) || (song.master !== undefined && !isDefaultMaster(song.master));
}

/** A track whose clef changes somewhere (GP3–GP5 files hold one clef per track, from its tuning). */
function hasClefChanges(song: Song): boolean {
  return song.tracks.some((track) => track.measures.some((measure, index) => index > 0 && measure.clef !== track.measures[index - 1]?.clef));
}

/** True when a note plays in voice 3 or 4 (Guitar Pro 5 files hold two voices). */
function playsPastTwoVoices(song: Song): boolean {
  return song.tracks.some((track) => track.measures.some((measure) => measure.beats.some((beat) => beat.voices.slice(2).some((voice) => voice.notes.length > 0))));
}

/** What the hint strip says when `song` is saved in `format`: its note, and the voices, effects, audio track and clefs it leaves out. */
export function saveHint(format: SaveFormat, song: Song): string | undefined {
  const name = format.label.replace(/ \(.*\)$/, '');
  const voices = format.id === 'gp5' && playsPastTwoVoices(song) ? t('window.saveHint.voices', { format: name }) : undefined;
  const effects = format.id !== 'gp' && hasEffects(song) ? t('window.saveHint.effects', { format: name }) : undefined;
  const audio = format.id !== 'gp' && song.audioTrack !== undefined ? t('window.saveHint.audio', { format: name }) : undefined;
  const clefs = format.id !== 'gp' && hasClefChanges(song) ? t('window.saveHint.clefs', { format: name }) : undefined;
  const parts = [format.note, voices, effects, audio, clefs].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(' ');
}

/** The format of a file the app writes back as it is (by its extension, any case); undefined for any other file. */
export function saveFormatOf(path: string): SaveFormat | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? undefined : SAVE_FORMATS.find((format) => format.extension === name.slice(dot + 1));
}

/** Save As's preselected format: the file's own when the app writes it, else the first (GP5). */
export function defaultSaveFormat(path: string): SaveFormat {
  return saveFormatOf(path) ?? SAVE_FORMATS[0];
}

/** "Song.gpx" in GP5 → "Song.gp5". */
export function fileNameIn(fileName: string, format: FileFormat): string {
  return `${withoutExtension(fileName)}.${format.extension}`;
}
