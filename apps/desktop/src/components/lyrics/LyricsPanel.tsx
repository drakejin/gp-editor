import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { type LyricsDraft, gp5LyricsNote, lyricsFit } from '../../lib/lyrics-draft';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { TextField } from '../TextField';

export interface LyricsPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly draft: LyricsDraft;
  readonly onChooseTrack: (trackIndex: number) => void;
  readonly onChangeFrom: (from: number) => void;
  readonly onChangeText: (text: string) => void;
  readonly onClose: () => void;
}

/** Lines of text the field shows before it scrolls. */
const TEXT_LINES = 5;
const LINE_HEIGHT = 17;

/**
 * Edit ▸ Lyrics…: a track's lyrics and the bar they start at, as in Guitar Pro's lyrics editor. Above the score, which
 * follows the typing (useLyricsEditor applies it once the typing pauses).
 */
export function LyricsPanel({ palette, song, draft, onChooseTrack, onChangeFrom, onChangeText, onClose }: LyricsPanelProps) {
  const t = useT();
  const lastBar = Math.max(1, song.measureHeaders.length);
  const note = gp5LyricsNote(song, draft.trackIndex);
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t('common.lyrics')}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.chromeText }]}>{t('common.lyrics')}</Text>
        <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('tools.lyrics.track')}</Text>
        {song.tracks.map((track, index) => (
          <ChromeButton key={track.number} palette={palette} label={track.name || t('common.trackNumber', { number: track.number })} tooltip={t('tools.lyrics.trackTooltip', { number: track.number, name: track.name })} fontSize={11} isActive={index === draft.trackIndex} onPress={() => onChooseTrack(index)} />
        ))}
        <Text style={[styles.label, styles.spaced, { color: palette.chromeMuted }]}>{t('tools.lyrics.fromBar')}</Text>
        <ChromeButton palette={palette} label="−" tooltip={t('tools.lyrics.earlier')} isEnabled={draft.from > 1} onPress={() => onChangeFrom(draft.from - 1)} />
        <Text style={[styles.bar, { color: palette.chromeText }]}>{draft.from}</Text>
        <ChromeButton palette={palette} label="+" tooltip={t('tools.lyrics.later')} isEnabled={draft.from < lastBar} onPress={() => onChangeFrom(draft.from + 1)} />
        <View style={styles.fill} />
        <ChromeButton palette={palette} label={t('common.close')} tooltip={t('tools.lyrics.closeTooltip')} fontSize={11} onPress={onClose} />
      </View>
      <TextField
        accessibilityLabel={t('tools.lyrics.textLabel')}
        value={draft.text}
        onChangeText={onChangeText}
        multiline
        autoFocus
        placeholder={t('tools.lyrics.placeholder')}
        placeholderTextColor={palette.chromeMuted}
        style={[styles.text, { color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
      />
      <Text style={[styles.hint, { color: palette.chromeMuted }]}>{t('tools.lyrics.syntax')}</Text>
      <Text style={[styles.hint, { color: palette.chromeText }]}>{lyricsFit(song, draft)}</Text>
      {note === undefined ? null : <Text style={[styles.hint, { color: palette.chromeMuted }]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, rowGap: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 },
  title: { fontSize: 13, fontWeight: '800', marginRight: 14 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginRight: 4 },
  spaced: { marginLeft: 14 },
  bar: { minWidth: 28, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  fill: { flex: 1 },
  text: { height: TEXT_LINES * LINE_HEIGHT + 10, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 13 },
  hint: { fontSize: 11 },
});
