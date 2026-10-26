import { type Dispatch, useCallback, useEffect, useMemo, useRef } from 'react';
import { type Song, renderMidi, writeAsciiTab, writeMusicXml, writeMusicXmlArchive } from '@gp-editor/core';
import { bytesToBase64 } from '../lib/base64';
import { errorMessage } from '../lib/errors';
import { ASCII_TAB_FILE, type FileFormat, MIDI_FILE, MUSICXML_FILE, MXL_FILE, fileNameIn, formatName, layoutLeftOut } from '../lib/file-formats';
import { t } from '../lib/i18n/i18n';
import { type SavedFile, showSavePanel, subscribeSongExportRequests, writeFile, writeTextFile } from '../native/gp-files';
import type { EditorAction, OpenDocument } from '../state/editor';

export interface SongExport {
  /**
   * File ▸ Export MIDI…: the song as playback plays it — repeats unfolded, at its own tempo (not the practice speed),
   * muted tracks silent and, when a track is solo, only the solo tracks — as a .mid file.
   */
  readonly exportMidi: () => void;
  /** File ▸ Export ASCII Tab…: the song's fretted tracks as ASCII tab in a .txt file. */
  readonly exportAsciiTab: () => void;
  /** File ▸ Export MusicXML…: the song as MusicXML 4.0 text (.musicxml). */
  readonly exportMusicXml: () => void;
  /** File ▸ Export Compressed MusicXML…: the same score zipped (.mxl). */
  readonly exportCompressedMusicXml: () => void;
  /** One of these exports of the shown tab written at `path`, without the panel (the MCP server's export_file); rejects with why not. */
  readonly exportTo: (format: SongExportFormat, path: string) => Promise<SavedFile>;
}

/** The exports written straight from the song: MIDI, ASCII tab, MusicXML and compressed MusicXML. */
export type SongExportFormat = 'midi' | 'ascii_tab' | 'musicxml' | 'mxl';

/** One export: the file it makes, what the error banner calls it, and how its content is written. */
interface ExportKind {
  readonly file: FileFormat;
  readonly what: string;
  readonly write: (song: Song, path: string) => Promise<SavedFile>;
  /** What the file leaves out of the song, for the hint strip once it is written. */
  readonly leftOut?: (song: Song) => string | undefined;
}

/** The tracks Export ASCII Tab… writes: the fretted ones (ASCII tab has no drum notation), every track for drums only. */
export function asciiTabTrackIndexes(song: Song): readonly number[] {
  const all = song.tracks.map((_, index) => index);
  const fretted = all.filter((index) => song.tracks[index]?.isPercussion === false);
  return fretted.length > 0 ? fretted : all;
}

const MIDI_EXPORT: ExportKind = {
  file: MIDI_FILE,
  get what() {
    return t('window.exportWhat.midi');
  },
  write: (song, path) => writeFile(path, bytesToBase64(renderMidi(song).bytes)),
};

const ASCII_TAB_EXPORT: ExportKind = {
  file: ASCII_TAB_FILE,
  get what() {
    return t('window.exportWhat.asciiTab');
  },
  write: (song, path) => writeTextFile(path, writeAsciiTab(song, { trackIndexes: asciiTabTrackIndexes(song) })),
};

const MUSICXML_EXPORT: ExportKind = {
  file: MUSICXML_FILE,
  get what() {
    return t('window.exportWhat.musicXml');
  },
  write: (song, path) => writeTextFile(path, writeMusicXml(song)),
  leftOut: (song) => layoutLeftOut(formatName(MUSICXML_FILE), song),
};

const MXL_EXPORT: ExportKind = {
  file: MXL_FILE,
  get what() {
    return t('window.exportWhat.musicXml');
  },
  write: (song, path) => writeFile(path, bytesToBase64(writeMusicXmlArchive(song))),
  leftOut: (song) => layoutLeftOut(formatName(MXL_FILE), song),
};

const EXPORT_KINDS: Readonly<Record<SongExportFormat, ExportKind>> = { midi: MIDI_EXPORT, ascii_tab: ASCII_TAB_EXPORT, musicxml: MUSICXML_EXPORT, mxl: MXL_EXPORT };

/** Writes an export of the song at `path`; what the file leaves out goes to the hint strip. */
async function writeExport(kind: ExportKind, song: Song, path: string, dispatch: Dispatch<EditorAction>): Promise<SavedFile> {
  const saved = await kind.write(song, path);
  const hint = kind.leftOut?.(song);
  if (hint !== undefined) {
    dispatch({ type: 'showHint', hint });
  }
  return saved;
}

/**
 * File ▸ Export MIDI…, Export ASCII Tab…, Export MusicXML… and Export Compressed MusicXML… for the shown tab; a failure
 * goes to the error banner (`exportFailed`).
 */
export function useSongExport(document: OpenDocument | undefined, dispatch: Dispatch<EditorAction>): SongExport {
  // The shown document is read through a ref, so the File-menu listener is not re-added on every edit.
  const latest = useRef(document);
  latest.current = document;
  // One save panel at a time: a second menu choice can arrive while the first panel is up.
  const isRunning = useRef(false);
  const run = useCallback(
    async (kind: ExportKind) => {
      const current = latest.current;
      if (current === undefined || isRunning.current) {
        return;
      }
      isRunning.current = true;
      try {
        const { file } = kind;
        const chosen = await showSavePanel({ suggestedName: fileNameIn(current.fileName, file), formats: [file], formatId: file.id });
        if (chosen !== null) {
          await writeExport(kind, current.song, chosen.path, dispatch);
        }
      } catch (error: unknown) {
        dispatch({ type: 'exportFailed', what: kind.what, message: errorMessage(error) });
      } finally {
        isRunning.current = false;
      }
    },
    [dispatch],
  );
  const exportTo = useCallback(
    (format: SongExportFormat, path: string) => {
      const current = latest.current;
      // i18n-exempt: an MCP client's error, never shown in the app
      return current === undefined ? Promise.reject(new Error('No document is open')) : writeExport(EXPORT_KINDS[format], current.song, path, dispatch);
    },
    [dispatch],
  );
  const menu = useSongExportMenu(run);
  return useMemo(() => ({ ...menu, exportTo }), [menu, exportTo]);
}

/** The four exports as commands, and File ▸ Export MIDI… / ASCII Tab… / MusicXML… / Compressed MusicXML… running them. */
function useSongExportMenu(run: (kind: ExportKind) => Promise<void>): Omit<SongExport, 'exportTo'> {
  const commands = useMemo(
    () => ({
      exportMidi: () => {
        void run(MIDI_EXPORT);
      },
      exportAsciiTab: () => {
        void run(ASCII_TAB_EXPORT);
      },
      exportMusicXml: () => {
        void run(MUSICXML_EXPORT);
      },
      exportCompressedMusicXml: () => {
        void run(MXL_EXPORT);
      },
    }),
    [run],
  );
  useEffect(
    () =>
      subscribeSongExportRequests({
        onExportMidiRequested: commands.exportMidi,
        onExportAsciiTabRequested: commands.exportAsciiTab,
        onExportMusicXmlRequested: commands.exportMusicXml,
        onExportCompressedMusicXmlRequested: commands.exportCompressedMusicXml,
      }),
    [commands],
  );
  return commands;
}
