import {
  DEFAULT_STYLESHEET,
  type HeaderElement,
  type Song,
  type SongInfo,
  type TextElement,
  type TextStyle,
  type Track,
  findTuningPreset,
  resolveTrackInstrument,
  stylesheetOf,
  trackTuning,
} from '@gp-editor/core';
import { neckTitleFor } from '../lib/tuning-hint';
import type { DrawAlign, DrawCommand, TextCommand } from '../score/draw';
import { isSameTextStyle, styleText } from '../score/text-styles';
import type { Palette } from '../theme';
import { PAGE } from './paper';

/** Average width of a system-font character, in ems: estimates when a line would run past the page, to shrink it. */
export const AVERAGE_CHAR_WIDTH = 0.55;
/** Line height, as a multiple of the font size. */
const LINE_HEIGHT = 1.4;
const CREDIT_SEPARATOR = '  ·  ';

/** What a line of the title block shows; each kind has its own style (TITLE_LINE_STYLES). */
export type TitleLineKind = 'title' | 'subtitle' | 'artist' | 'album' | 'credits' | 'copyright' | 'track';

interface TitleLineStyle {
  readonly size: number;
  readonly align: DrawAlign;
  readonly isBold: boolean;
  readonly isMuted: boolean;
  /** Extra room above the line. */
  readonly spaceBefore: number;
}

const TITLE_LINE_STYLES: Readonly<Record<TitleLineKind, TitleLineStyle>> = {
  title: { size: 22, align: 'center', isBold: true, isMuted: false, spaceBefore: 0 },
  subtitle: { size: 14, align: 'center', isBold: false, isMuted: false, spaceBefore: 0 },
  artist: { size: 12, align: 'center', isBold: false, isMuted: false, spaceBefore: 2 },
  album: { size: 11, align: 'center', isBold: false, isMuted: true, spaceBefore: 0 },
  credits: { size: 10, align: 'center', isBold: false, isMuted: true, spaceBefore: 2 },
  copyright: { size: 10, align: 'center', isBold: false, isMuted: true, spaceBefore: 0 },
  track: { size: 10, align: 'left', isBold: true, isMuted: false, spaceBefore: 8 },
};

/** Who is credited on the credits line: each with the stylesheet's font of its own. */
export type CreditElement = Extract<TextElement, 'words' | 'music' | 'tabber'>;

/** One credit of the credits line ("Music: …"), in its element's font. */
export interface CreditPart {
  readonly element: CreditElement;
  readonly text: string;
}

export interface TitleLine {
  readonly kind: TitleLineKind;
  readonly text: string;
  /** The credits line's credits, in order (its text is them joined). */
  readonly parts?: readonly CreditPart[];
}

/** The stylesheet's font of a line (the track line has none: it is not song information). */
export function titleLineElement(kind: TitleLineKind): TextElement | undefined {
  return kind === 'credits' || kind === 'track' ? undefined : kind;
}

/** The credits the stylesheet's header shows: music, words (once, as "Words & Music", when one person wrote both), tab. */
export function creditParts(info: SongInfo, shown: Readonly<Record<HeaderElement, boolean>>): CreditPart[] {
  const words = shown.words ? info.words : '';
  const music = shown.music ? info.music : '';
  const authors: readonly CreditPart[] =
    words !== '' && words === music
      ? [{ element: 'music', text: `Words & Music: ${words}` }]
      : [...(music === '' ? [] : [{ element: 'music' as const, text: `Music: ${music}` }]), ...(words === '' ? [] : [{ element: 'words' as const, text: `Words: ${words}` }])];
  const tab = shown.tabber && info.transcriber !== '' ? [{ element: 'tabber' as const, text: `Tab: ${info.transcriber}` }] : [];
  return [...authors, ...tab];
}

/**
 * Lines of the title block, empty ones left out: the title, subtitle, artist, album, the author and tab credits
 * (as under the title on screen), the copyright, then the exported track with its instrument and tuning. The song's
 * stylesheet says which song information shows (Header & Footer).
 */
export function titleBlockLines(song: Song, trackIndex: number, title: string): TitleLine[] {
  const { info } = song;
  const { shown } = stylesheetOf(song).header;
  const track = song.tracks[trackIndex];
  const parts = creditParts(info, shown);
  const lines: readonly TitleLine[] = [
    { kind: 'title', text: shown.title ? title : '' },
    { kind: 'subtitle', text: shown.subtitle ? info.subtitle : '' },
    { kind: 'artist', text: shown.artist ? info.artist : '' },
    { kind: 'album', text: shown.album ? info.album : '' },
    { kind: 'credits', text: parts.map((part) => part.text).join(CREDIT_SEPARATOR), parts },
    { kind: 'copyright', text: shown.copyright ? info.copyright : '' },
    { kind: 'track', text: track === undefined ? '' : trackLine(song, track) },
  ];
  return lines.filter((line) => line.text.length > 0);
}

/** "Lead — Guitar · 6 strings · Drop D (D A D G B E) · capo 2"; a drum track shows only its name. */
function trackLine(song: Song, track: Track): string {
  const name = track.name || `Track ${track.number}`;
  const instrument = resolveTrackInstrument(track, song.channels);
  if (instrument === 'percussion') {
    return name;
  }
  return `${name} — ${neckTitleFor(instrument, findTuningPreset(instrument, trackTuning(track)), track)}`;
}

/** The title block `width` points wide: headings centred, the track line on the left. */
export function engraveTitleBlock(song: Song, trackIndex: number, title: string, width: number, palette: Palette): TitleBlock {
  const texts = stylesheetOf(song).texts;
  const placed = titleBlockLines(song, trackIndex, title).reduce<{ readonly commands: readonly DrawCommand[]; readonly y: number }>(
    (block, line) => {
      const style = TITLE_LINE_STYLES[line.kind];
      const top = block.y + style.spaceBefore;
      const commands = lineCommands(line, { width, top, palette, texts });
      const lineHeight = style.size * lineScale(line, texts) * LINE_HEIGHT;
      // The line's commands were placed for its own style's height; a larger font moves them down to the new centre.
      const shift = lineHeight / 2 - (style.size * LINE_HEIGHT) / 2;
      return { commands: [...block.commands, ...commands.map((command) => (shift === 0 ? command : { ...command, y: command.y + shift }))], y: top + lineHeight };
    },
    { commands: [], y: 0 },
  );
  return { commands: placed.commands, height: placed.y + PAGE.titleGap };
}

/** How much larger the stylesheet draws a line than the app's default (its largest credit, for the credits). */
function lineScale(line: TitleLine, texts: Readonly<Record<TextElement, TextStyle>>): number {
  const element = titleLineElement(line.kind);
  const elements: readonly TextElement[] = element !== undefined ? [element] : (line.parts ?? []).map((part) => part.element);
  return elements.length === 0 ? 1 : Math.max(...elements.map((each) => texts[each].size / DEFAULT_STYLESHEET.texts[each].size));
}

interface LinePlace {
  readonly width: number;
  readonly top: number;
  readonly palette: Palette;
  readonly texts: Readonly<Record<TextElement, TextStyle>>;
}

/** A line in its print style: one text (shrunk to fit the width), or the credits in their fonts side by side. */
function lineCommands(line: TitleLine, place: LinePlace): TextCommand[] {
  const style = TITLE_LINE_STYLES[line.kind];
  const { width, top, palette, texts } = place;
  const parts = line.parts ?? [];
  const command: TextCommand = {
    kind: 'text', x: style.align === 'center' ? width / 2 : 0, y: top + (style.size * LINE_HEIGHT) / 2, text: line.text,
    size: fitFontSize(line.text, style.size, width), color: style.isMuted ? palette.muted : palette.text,
    font: 'ui', align: style.align, bold: style.isBold,
  };
  const element = titleLineElement(line.kind);
  if (element !== undefined) {
    return [styleText(command, texts[element], DEFAULT_STYLESHEET.texts[element])];
  }
  if (parts.every((part) => isSameTextStyle(texts[part.element], DEFAULT_STYLESHEET.texts[part.element]))) {
    return [command];
  }
  return creditCommands(parts, command, texts);
}

/** The credits centred side by side, each in its own font (widths estimated as fitFontSize does). */
function creditCommands(parts: readonly CreditPart[], line: TextCommand, texts: Readonly<Record<TextElement, TextStyle>>): TextCommand[] {
  const styled = parts.map((part, i) => {
    const text = i === parts.length - 1 ? part.text : `${part.text}${CREDIT_SEPARATOR}`;
    return styleText({ ...line, text, align: 'left' }, texts[part.element], DEFAULT_STYLESHEET.texts[part.element]);
  });
  const widths = styled.map((command) => command.text.length * command.size * AVERAGE_CHAR_WIDTH);
  let x = line.x - widths.reduce((sum, partWidth) => sum + partWidth, 0) / 2;
  return styled.map((command, i) => {
    const placed = { ...command, x };
    x += widths[i] ?? 0;
    return placed;
  });
}

/** The heading of a PDF's first page, drawn from y = 0 down. */
export interface TitleBlock {
  readonly commands: readonly DrawCommand[];
  /** From its top to where the score starts. */
  readonly height: number;
}

/** `size`, or smaller when the text would run past `width` (estimated with AVERAGE_CHAR_WIDTH); one decimal, rounded down. */
export function fitFontSize(text: string, size: number, width: number): number {
  const estimated = text.length * size * AVERAGE_CHAR_WIDTH;
  return estimated <= width ? size : Math.floor((width / (text.length * AVERAGE_CHAR_WIDTH)) * 10) / 10;
}
