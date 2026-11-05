import type { Track } from '@gp-editor/core';
import { t } from './i18n/i18n';

/** A track as the window names it: its name, or "Track 2" when it has none. */
export function trackLabel(track: Pick<Track, 'name' | 'number'>): string {
  const name = track.name.trim();
  return name === '' ? t('common.trackNumber', { number: track.number }) : name;
}
