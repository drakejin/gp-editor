import { memo } from 'react';
import { ScoreCanvas } from '../../native/score-canvas';

/** How a kind of SMuFL glyph sits in a palette button: its size and where its baseline goes. */
export type GlyphKind = 'note' | 'dynamic' | 'articulation' | 'barline' | 'mark' | 'stroke';

/** Size (points) and baseline (from the top of the icon) per glyph kind: SMuFL glyphs hang from their baseline. */
const GLYPH_BOXES: Readonly<Record<GlyphKind, { readonly size: number; readonly baseline: number }>> = {
  note: { size: 18, baseline: 19 },
  dynamic: { size: 22, baseline: 17 },
  articulation: { size: 24, baseline: 15 },
  barline: { size: 15, baseline: 20 },
  mark: { size: 18, baseline: 16 },
  /** Brush arrows (arpeggiato), about 1.5 sizes tall. */
  stroke: { size: 13, baseline: 22 },
};

export const MUSIC_ICON_SIZE = 24;

interface MusicIconProps {
  readonly glyph: string;
  readonly kind: GlyphKind;
  readonly color: string;
}

/** One Bravura glyph drawn by the score canvas, so it sits on its baseline exactly as in the score. */
function MusicIconView({ glyph, kind, color }: MusicIconProps) {
  const { size, baseline } = GLYPH_BOXES[kind];
  return (
    <ScoreCanvas
      commands={[{ kind: 'text', x: MUSIC_ICON_SIZE / 2, y: baseline, text: glyph, size, color, font: 'music', align: 'center' }]}
      style={{ width: MUSIC_ICON_SIZE, height: MUSIC_ICON_SIZE }}
    />
  );
}

export const MusicIcon = memo(MusicIconView);
