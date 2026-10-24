import { type Song, type WritableFormat, hasBarDesign, isDefaultMaster, isDefaultStylesheet } from '@gp-editor/core';
import { withoutExtension } from './file-name';

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
  { id: 'gp5', label: 'Guitar Pro 5 (.gp5)', extension: 'gp5' },
  {
    id: 'gp',
    label: 'Guitar Pro 7/8 (.gp)',
    extension: 'gp',
    note: 'Guitar Pro 7/8 keeps what the editor edits, the audio track, and the stylesheet and Design Mode layout (for GP Editor: Guitar Pro reads its own); Guitar Pro’s sound settings (RSE) are not kept, nor cautionary and forced accidentals.',
  },
  {
    id: 'gp4',
    label: 'Guitar Pro 4 (.gp4)',
    extension: 'gp4',
    note: 'Guitar Pro 4 keeps one voice per bar (voices 2, 3 and 4 join voice 1) and one triplet feel; heavy accents, directions, hairpins, fade outs, volume swells, the sustain pedal, rhythm slashes, beaming, shown accidentals and octave signs are left out.',
  },
  {
    id: 'gp3',
    label: 'Guitar Pro 3 (.gp3)',
    extension: 'gp3',
    note:
      'Guitar Pro 3 keeps one voice per bar (voices 2, 3 and 4 join voice 1), one triplet feel and no lyrics; palm mutes, accents, staccato, trills, tremolo picking, directions, hairpins, fade outs, volume swells, rasgueado, the sustain pedal, rhythm slashes, beaming, shown accidentals and octave signs are left out.',
  },
];

/** File ▸ Export MIDI…: a Standard MIDI File of the song as playback plays it. */
export const MIDI_FILE: FileFormat = {
  id: 'mid',
  label: 'MIDI (.mid)',
  extension: 'mid',
  note: 'The song as played: repeats unfolded, at its own tempo (not the practice speed); muted tracks are left out, and only solo tracks play when one is solo.',
};

/** File ▸ Export ASCII Tab…: plain UTF-8 text. */
export const ASCII_TAB_FILE: FileFormat = {
  id: 'txt',
  label: 'ASCII tab (.txt)',
  extension: 'txt',
  note: 'The fretted tracks as ASCII tab; drum tracks are left out.',
};

/** File ▸ Export MusicXML…: MusicXML 4.0 as UTF-8 text, for other notation programs. */
export const MUSICXML_FILE: FileFormat = {
  id: 'musicxml',
  label: 'MusicXML (.musicxml)',
  extension: 'musicxml',
  note: 'Each track as a notation staff and a tab staff; bends, slides, vibrato and the other guitar effects as MusicXML marks them.',
};

/** File ▸ Export Compressed MusicXML…: the same score zipped. */
export const MXL_FILE: FileFormat = {
  id: 'mxl',
  label: 'Compressed MusicXML (.mxl)',
  extension: 'mxl',
  note: 'MusicXML zipped: smaller, and opened by the same programs.',
};

/** Only .gp files keep the app's playback effects (gp-core's songEffectsToJson, an entry of the zip). */
function hasEffects(song: Song): boolean {
  return song.tracks.some((track) => (track.effects?.length ?? 0) > 0) || (song.master !== undefined && !isDefaultMaster(song.master));
}

/** The song's stylesheet differs from the default, or a bar was laid out in Design Mode: only .gp files keep them. */
export function hasOwnLayout(song: Song): boolean {
  return (song.stylesheet !== undefined && !isDefaultStylesheet(song.stylesheet)) || hasBarDesign(song);
}

/** What a file without the stylesheet leaves out ("Guitar Pro 5 keeps no stylesheet …"); undefined when nothing is lost. */
export function layoutLeftOut(name: string, song: Song): string | undefined {
  return hasOwnLayout(song) ? `${name} keeps no stylesheet or Design Mode layout: save as Guitar Pro 7/8 (.gp) to keep them.` : undefined;
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
  const voices = format.id === 'gp5' && playsPastTwoVoices(song) ? `${name} keeps two voices: the notes of voices 3 and 4 are left out; save as Guitar Pro 7/8 (.gp) to keep them.` : undefined;
  const effects = format.id !== 'gp' && hasEffects(song) ? `${name} keeps no playback effects: save as Guitar Pro 7/8 (.gp) to keep them.` : undefined;
  const audio = format.id !== 'gp' && song.audioTrack !== undefined ? `${name} keeps no audio track: save as Guitar Pro 7/8 (.gp) to keep it.` : undefined;
  const clefs = format.id !== 'gp' && hasClefChanges(song) ? `${name} keeps one clef per track (from its tuning): save as Guitar Pro 7/8 (.gp) to keep the clef changes.` : undefined;
  const layout = format.id === 'gp' ? undefined : layoutLeftOut(name, song);
  const parts = [format.note, voices, effects, audio, clefs, layout].filter((part): part is string => part !== undefined);
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
