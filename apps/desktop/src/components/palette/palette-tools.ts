import type { GlyphKind } from './MusicIcon';
import { type Beat, type Bend, type Measure, type MeasureHeader, type Note, type Song, type StringAddress, type Voice, findNote } from '@gp-editor/core';
import type { NotePanel } from '../../lib/key-commands';
import type { EditorAction } from '../../state/editor';
import { type SongEdit, cursorVoice } from '../../state/song-edits';

/** What the palette knows about the cursor: its note, voice, beat and bar. */
export interface PaletteContext {
  readonly cursor?: StringAddress;
  readonly note?: Note;
  readonly voice?: Voice;
  readonly beat?: Beat;
  readonly header?: MeasureHeader;
  readonly keySignature: number;
  /** The cursor's measure (its sustain pedal marks). */
  readonly measure?: Measure;
}

export function paletteContext(song: Song, cursor: StringAddress | undefined): PaletteContext {
  if (cursor === undefined) {
    return { keySignature: 0 };
  }
  const measure = song.tracks[cursor.trackIndex]?.measures[cursor.measureIndex];
  return {
    cursor,
    note: findNote(song, cursor),
    voice: cursorVoice(song, cursor),
    beat: measure?.beats[cursor.beatIndex],
    header: song.measureHeaders[cursor.measureIndex],
    keySignature: measure?.keySignature ?? 0,
    measure,
  };
}

/** What a tool needs to act on: the note at the cursor, its beat (voice), or its bar. */
export type ToolScope = 'note' | 'beat' | 'bar';

/** A choice in a tool's option strip (bend presets, slide kinds, tuplet sizes …). */
export interface PaletteOption {
  readonly label: string;
  readonly tooltip: string;
  readonly edit: SongEdit;
  readonly isActive?: (context: PaletteContext) => boolean;
}

/** What pressing a tool does. */
export type PaletteRun =
  | { readonly kind: 'edit'; readonly edit: SongEdit }
  | { readonly kind: 'action'; readonly action: EditorAction }
  /** Opens a strip of options under the group. */
  | { readonly kind: 'options'; readonly options: readonly PaletteOption[] }
  /** Opens a text field under the group (section name, beat text). */
  | { readonly kind: 'text'; readonly placeholder: string; readonly value: (context: PaletteContext) => string; readonly edit: (text: string) => SongEdit }
  /** Opens the vibrato or bend panel for the note, as B and C do. */
  | { readonly kind: 'panel'; readonly panel: NotePanel }
  /** Opens the chord diagram panel for the beat, as K does. */
  | { readonly kind: 'chordPanel' };

export interface PaletteTool {
  readonly id: string;
  /** The button's face: a SMuFL code point (drawn with Bravura) when `glyph` says how it sits, else short text. */
  readonly face: string;
  readonly glyph?: GlyphKind;
  /** Name, what it does and its key, shown on hover. */
  readonly tooltip: string;
  /** The key that does the same (a letter of key-commands), shown in the button's corner. */
  readonly key?: string;
  readonly scope: ToolScope;
  readonly isActive?: (context: PaletteContext) => boolean;
  readonly run: PaletteRun;
}

/** "Label  [−] value [+]" for a bar setting. */
export interface PaletteStepper {
  readonly id: string;
  readonly label: string;
  readonly tooltip: string;
  readonly value: (context: PaletteContext) => string;
  readonly minus: SongEdit;
  readonly plus: SongEdit;
  readonly isEnabled?: (context: PaletteContext) => boolean;
  /** Drawn on the previous stepper's row, without its label (the time signature's two numbers); the label stays a command keyword. */
  readonly isBesidePrevious?: boolean;
}

export interface PaletteGroup {
  readonly title: string;
  readonly tools: readonly PaletteTool[];
  /** Every tool this wide, for an even grid (tools with a key need the room); default: as narrow as the face. */
  readonly toolWidth?: number;
  readonly steppers?: readonly PaletteStepper[];
}

export function isToolEnabled(tool: Pick<PaletteTool, 'scope'>, context: PaletteContext): boolean {
  switch (tool.scope) {
    case 'note':
      return context.note !== undefined;
    case 'beat':
      return context.voice !== undefined;
    case 'bar':
      return context.header !== undefined;
  }
}

export function isSameBend(a: Bend | undefined, b: Bend | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.points.length === b.points.length &&
    a.points.every((point, i) => point.position === b.points[i]?.position && point.value === b.points[i]?.value)
  );
}
