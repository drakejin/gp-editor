import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../hooks/use-i18n';
import type { SongsterrSong } from '../../songsterr/songsterr-answer';
import { shownTracks, songLabel, trackSummary } from '../../songsterr/songsterr-tracks';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';

interface SongsterrResultsProps {
  readonly palette: Palette;
  readonly songs: readonly SongsterrSong[];
  readonly onOpenSong: (songId: number) => void;
}

interface SongRowProps {
  readonly palette: Palette;
  readonly song: SongsterrSong;
  readonly onOpenSong: (songId: number) => void;
}

/** A song found: "title — artist", Open on Songsterr, and its most viewed tracks (instrument · name · tuning). */
function SongRowView({ palette, song, onOpenSong }: SongRowProps) {
  const t = useT();
  const label = songLabel(song);
  const { tracks, hiddenCount } = shownTracks(song);
  return (
    <View testID={`songsterr-song-${song.songId}`} style={[styles.song, { borderColor: palette.chromeBorder }]}>
      <View style={styles.songHeader}>
        <Text numberOfLines={2} style={[styles.songLabel, { color: palette.chromeText }]}>
          {label}
        </Text>
        <ChromeButton palette={palette} label={t('tools.songsterr.openSong')} tooltip={t('tools.songsterr.openSongTooltip', { song: label })} fontSize={11} onPress={() => onOpenSong(song.songId)} />
      </View>
      {tracks.length === 0 ? <Text style={[styles.track, { color: palette.chromeMuted }]}>{t('tools.songsterr.noTracks')}</Text> : null}
      {tracks.map((track, index) => (
        // A song's tracks have no id of their own in the answer; their order is fixed by views.
        <Text key={index} numberOfLines={1} style={[styles.track, { color: palette.chromeMuted }]}>
          {trackSummary(track)}
        </Text>
      ))}
      {hiddenCount > 0 ? <Text style={[styles.track, { color: palette.chromeMuted }]}>{t('tools.songsterr.moreTracks', { count: hiddenCount })}</Text> : null}
    </View>
  );
}

const SongRow = memo(SongRowView);

/** The songs a search found, scrolling when they are taller than the card's room. */
export function SongsterrResults({ palette, songs, onOpenSong }: SongsterrResultsProps) {
  return (
    <ScrollView style={styles.list}>
      {songs.map((song) => (
        <SongRow key={song.songId} palette={palette} song={song} onOpenSong={onOpenSong} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 0, flexShrink: 1, marginTop: 6 },
  song: { paddingVertical: 8, borderTopWidth: 1 },
  songHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  songLabel: { flex: 1, fontSize: 13, fontWeight: '700', marginRight: 8 },
  track: { fontSize: 11, lineHeight: 16 },
});
