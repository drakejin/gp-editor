import { type Song, type Track, findTuningPreset, resolveTrackInstrument, trackTuning } from '@gp-editor/core';
import { authorshipCredits } from '../lib/song-credits';
import { neckTitleFor } from '../lib/tuning-hint';
import type { DrawAlign, DrawCommand } from '../score/draw';
import type { Palette } from '../theme';
import { PAGE } from './paper';

/** Average width of a system-font character, in ems: estimates when a line would run past the page, to shrink it. */
export const AVERAGE_CHAR_WIDTH = 0.55;
/** Line height, as a multiple of the font size. */
const LINE_HEIGHT = 1.4;
const CREDIT_SEPARATOR = '  ·  ';

/** What a line of the title block shows; each kind has its own style (TITLE_LINE_STYLES). */
export type TitleLineKind = 'title' | 'subtitle' | 'artist' | 'album' | 'credits' | 'track';

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
  track: { size: 10, align: 'left', isBold: true, isMuted: false, spaceBefore: 8 },
};

export interface TitleLine {
  readonly kind: TitleLineKind;
  readonly text: string;
}

/** The heading of a PDF's first page, drawn from y = 0 down. */
export interface TitleBlock {
  readonly commands: readonly DrawCommand[];
  /** From its top to where the score starts. */
  readonly height: number;
}

/**
 * Lines of the title block, empty ones left out: the title, subtitle, artist, album, the author and tab credits
 * (as under the title on screen), then the exported track with its instrument and tuning.
 */
export function titleBlockLines(song: Song, trackIndex: number, title: string): TitleLine[] {
  const { info } = song;
  const track = song.tracks[trackIndex];
  const lines: readonly TitleLine[] = [
    { kind: 'title', text: title },
    { kind: 'subtitle', text: info.subtitle },
    { kind: 'artist', text: info.artist },
    { kind: 'album', text: info.album },
    { kind: 'credits', text: authorshipCredits(info).join(CREDIT_SEPARATOR) },
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
  const placed = titleBlockLines(song, trackIndex, title).reduce<{ readonly commands: readonly DrawCommand[]; readonly y: number }>(
    (block, line) => {
      const style = TITLE_LINE_STYLES[line.kind];
      const top = block.y + style.spaceBefore;
      const lineHeight = style.size * LINE_HEIGHT;
      const command: DrawCommand = {
        kind: 'text', x: style.align === 'center' ? width / 2 : 0, y: top + lineHeight / 2, text: line.text,
        size: fitFontSize(line.text, style.size, width), color: style.isMuted ? palette.muted : palette.text,
        font: 'ui', align: style.align, bold: style.isBold,
      };
      return { commands: [...block.commands, command], y: top + lineHeight };
    },
    { commands: [], y: 0 },
  );
  return { commands: placed.commands, height: placed.y + PAGE.titleGap };
}

/** `size`, or smaller when the text would run past `width` (estimated with AVERAGE_CHAR_WIDTH); one decimal, rounded down. */
export function fitFontSize(text: string, size: number, width: number): number {
  const estimated = text.length * size * AVERAGE_CHAR_WIDTH;
  return estimated <= width ? size : Math.floor((width / (text.length * AVERAGE_CHAR_WIDTH)) * 10) / 10;
}
