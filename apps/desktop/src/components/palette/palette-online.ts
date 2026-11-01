import { t } from '../../lib/i18n/i18n';
import type { PaletteGroup } from './palette-tools';

/**
 * ONLINE TOOLS, the palette's last group: tools that reach the internet, each a window command as its menu item runs
 * it — Songsterr (Tools ▸ Online ▸ Songsterr Search…: the search panel), AI Compose (Claude writes bars from the
 * cursor: `openComposePanel`) and AI Edit (Edit ▸ AI Wizard ▸ AI Edit…: `openAiEditPanel`). Usable with or without a
 * cursor. The three share one row as wide as their faces (measured in palette-fit's table): at fixed widths the row
 * would need 3 × 70 points, the palette's inside is 197.
 */
export function onlineGroup(): PaletteGroup {
  return {
    id: 'online',
    title: t('palette.group.online'),
    tools: [
      { id: 'songsterr', face: t('palette.face.songsterr'), tooltip: t('palette.tool.songsterr'), scope: 'always', run: { kind: 'command', command: { type: 'openSongsterrPanel' } } },
      { id: 'aiCompose', face: t('palette.face.aiCompose'), tooltip: t('palette.tool.aiCompose'), scope: 'always', run: { kind: 'command', command: { type: 'openComposePanel' } } },
      { id: 'aiEdit', face: t('palette.face.aiEdit'), tooltip: t('palette.tool.aiEdit'), scope: 'always', run: { kind: 'command', command: { type: 'openAiEditPanel' } } },
    ],
  };
}
