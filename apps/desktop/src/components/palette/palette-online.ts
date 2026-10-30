import { t } from '../../lib/i18n/i18n';
import type { PaletteGroup } from './palette-tools';

/**
 * Each of the group's two tools is this wide, so both share one row: the palette's 197 points inside (214, less its
 * 1-point border and the groups' 2 × 8 padding) hold 2 × (96 + 2).
 */
const ONLINE_TOOL_WIDTH = 96;

/**
 * ONLINE TOOLS, the palette's last group: tools that reach the internet, each a window command as its menu item runs
 * it — Songsterr (Tools ▸ Online ▸ Songsterr Search…: the search panel) and AI Compose (Claude writes bars from the
 * cursor: `openComposePanel`). Usable with or without a cursor.
 */
export function onlineGroup(): PaletteGroup {
  return {
    id: 'online',
    title: t('palette.group.online'),
    toolWidth: ONLINE_TOOL_WIDTH,
    tools: [
      { id: 'songsterr', face: t('palette.face.songsterr'), tooltip: t('palette.tool.songsterr'), scope: 'always', run: { kind: 'command', command: { type: 'openSongsterrPanel' } } },
      { id: 'aiCompose', face: t('palette.face.aiCompose'), tooltip: t('palette.tool.aiCompose'), scope: 'always', run: { kind: 'command', command: { type: 'openComposePanel' } } },
    ],
  };
}
