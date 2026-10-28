import { t } from '../../lib/i18n/i18n';
import type { PaletteTool } from './palette-tools';

/** J: the annotation panel, free in Guitar Pro 8 too (key-commands.ts' ANNOTATION_KEY). */
const ANNOTATION_KEY = 'J';

/** The Beat group's annotation (a musician's note on the beat, in a box over or under the staves): lit where the beat has one. */
export function annotationTool(): PaletteTool {
  return {
    id: 'annotation',
    // i18n-exempt: a pencil, the same in every language
    face: '✎',
    key: ANNOTATION_KEY,
    tooltip: `${t('palette.tool.annotation')} (${ANNOTATION_KEY})`,
    scope: 'beat',
    run: { kind: 'annotationPanel' },
    isActive: (c) => c.beat?.annotation !== undefined,
  };
}

/** The Beat group's Lyrics: the lyrics panel (Edit ▸ Lyrics…), syllables sung one per beat. */
export function lyricsTool(): PaletteTool {
  return { id: 'lyrics', face: t('palette.face.lyrics'), tooltip: t('palette.tool.lyrics'), scope: 'bar', run: { kind: 'lyricsPanel' } };
}
