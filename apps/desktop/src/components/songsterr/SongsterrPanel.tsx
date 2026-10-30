import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Translate, useT } from '../../hooks/use-i18n';
import type { SongsterrSearch, SongsterrStatus } from '../../hooks/use-songsterr';
import { failureMessage } from '../../songsterr/songsterr-search';
import { type Palette, onChrome } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { EDITION_PALETTE_WIDTH } from '../palette/EditionPalette';
import { TextField } from '../TextField';
import { SongsterrResults } from './SongsterrResults';

/** The card's room over the score (right of the edition palette, under the tab strip), its width and inner spacing. */
export const SONGSTERR_PANEL = {
  top: 92,
  left: EDITION_PALETTE_WIDTH + 16,
  margin: 16,
  width: 520,
  padding: 14,
} as const;

interface SongsterrPanelProps {
  readonly palette: Palette;
  readonly songsterr: SongsterrSearch;
}

/** The line under the field: what to do, what is being searched, what was found, or why nothing was. */
function statusText(t: Translate, status: SongsterrStatus): string {
  switch (status.kind) {
    case 'idle':
      return t('tools.songsterr.idle');
    case 'searching':
      return t('tools.songsterr.searching', { query: status.query });
    case 'found':
      return t('tools.songsterr.found', {
        count: status.songs.length,
        query: status.query,
      });
    case 'empty':
      return t('tools.songsterr.empty', { query: status.query });
    case 'failed':
      return failureMessage(status.failure);
  }
}

/** The title, what the panel does and ×. */
function SongsterrHeader({ palette, onClose }: { readonly palette: Palette; readonly onClose: () => void }) {
  const t = useT();
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: palette.chromeText }]}>{t('tools.songsterr.title')}</Text>
      <Text numberOfLines={1} style={[styles.subtitle, { color: palette.chromeMuted }]}>
        {t('tools.songsterr.subtitle')}
      </Text>
      <ChromeButton palette={palette} label="✕" tooltip={t('tools.songsterr.closeTooltip')} onPress={onClose} />
    </View>
  );
}

/** The field (↩ searches now, typing searches once it pauses, Esc closes the panel) and Search. */
function SearchRow({ palette, songsterr }: SongsterrPanelProps) {
  const t = useT();
  return (
    <View style={styles.searchRow}>
      <TextField
        autoFocus
        accessibilityLabel={t('tools.songsterr.field')}
        value={songsterr.query}
        onChangeText={songsterr.changeQuery}
        onSubmitEditing={songsterr.searchNow}
        placeholder={t('tools.songsterr.placeholder')}
        placeholderTextColor={palette.chromeMuted}
        style={[
          styles.field,
          {
            color: palette.chromeText,
            borderColor: palette.chromeBorder,
            backgroundColor: palette.chromeDeep,
          },
        ]}
      />
      <ChromeButton palette={palette} label={t('tools.songsterr.search')} tooltip={t('tools.songsterr.searchTooltip')} onPress={songsterr.searchNow} />
    </View>
  );
}

/** The small print: where the results come from, that tabs open on Songsterr's site, and its terms (a link). */
function FinePrint({ palette, onOpenTerms }: { readonly palette: Palette; readonly onOpenTerms: () => void }) {
  const t = useT();
  return (
    <View style={[styles.finePrint, { borderColor: palette.chromeBorder }]}>
      <Text style={[styles.small, { color: palette.chromeMuted }]}>{t('tools.songsterr.finePrint')}</Text>
      <Pressable accessibilityRole="link" tooltip={t('tools.songsterr.termsTooltip')} onPress={onOpenTerms}>
        <Text style={[styles.small, styles.link, { color: onChrome(palette).accent }]}>{t('tools.songsterr.terms')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Tools ▸ Online ▸ Songsterr Search… and the palette's ONLINE TOOLS ▸ Songsterr: a card over the score that searches
 * songsterr.com for a song (the open song's title and artist to start with) and opens a song's page in the browser —
 * the app only searches and links, it never downloads tabs (songsterr-urls.ts). Closed by × or Esc (the window's panel
 * order); clicks beside the card reach the score.
 */
export function SongsterrPanel({ palette, songsterr }: SongsterrPanelProps) {
  const t = useT();
  const { status } = songsterr;
  const errorColor = onChrome(palette).danger;
  return (
    <View style={styles.room} pointerEvents="box-none">
      <View
        testID="songsterr-panel"
        style={[
          styles.card,
          {
            backgroundColor: palette.chrome,
            borderColor: palette.chromeBorder,
          },
        ]}
      >
        <SongsterrHeader palette={palette} onClose={songsterr.close} />
        <SearchRow palette={palette} songsterr={songsterr} />
        <Text
          style={[
            styles.status,
            {
              color: status.kind === 'failed' ? errorColor : palette.chromeMuted,
            },
          ]}
        >
          {statusText(t, status)}
        </Text>
        {status.kind === 'found' ? <SongsterrResults palette={palette} songs={status.songs} onOpenSong={songsterr.openSong} /> : null}
        {songsterr.notice === undefined ? null : <Text style={[styles.status, { color: errorColor }]}>{songsterr.notice}</Text>}
        <FinePrint palette={palette} onOpenTerms={songsterr.openTerms} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    position: 'absolute',
    top: SONGSTERR_PANEL.top,
    left: SONGSTERR_PANEL.left,
    right: SONGSTERR_PANEL.margin,
    bottom: SONGSTERR_PANEL.margin,
    alignItems: 'flex-start',
  },
  card: {
    width: SONGSTERR_PANEL.width,
    maxWidth: '100%',
    maxHeight: '100%',
    padding: SONGSTERR_PANEL.padding,
    borderWidth: 1,
    borderRadius: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginRight: 10,
  },
  subtitle: { flex: 1, fontSize: 12, marginRight: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  field: {
    flex: 1,
    height: 26,
    fontSize: 13,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 5,
    marginRight: 6,
  },
  status: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  finePrint: { marginTop: 10, paddingTop: 8, borderTopWidth: 1 },
  small: { fontSize: 10, lineHeight: 14 },
  link: { textDecorationLine: 'underline', marginTop: 2 },
});
