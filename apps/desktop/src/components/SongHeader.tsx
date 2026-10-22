import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { songCredits } from '../lib/song-credits';
import type { Palette } from '../theme';
import { plural } from '../lib/wording';

interface SongHeaderProps {
  readonly song: Song;
  readonly fileName: string;
  readonly palette: Palette;
}

const FORMAT_LABEL: Readonly<Record<Song['source']['format'], string>> = {
  gp1: 'Guitar Pro 1',
  gp2: 'Guitar Pro 2',
  gp3: 'Guitar Pro 3',
  gp4: 'Guitar Pro 4',
  gp5: 'Guitar Pro 5',
  gpx: 'Guitar Pro 6',
  gp7: 'Guitar Pro 7+',
};

function SongHeaderView({ song, fileName, palette }: SongHeaderProps) {
  const { info } = song;
  const credits = songCredits(info);
  return (
    <View style={[styles.container, { backgroundColor: palette.paper, borderColor: palette.border }]}>
      <View style={styles.titleRow}>
        <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
          {info.title || fileName}
        </Text>
        <Text style={[styles.badge, { color: palette.accentText, backgroundColor: palette.accent }]}>
          {FORMAT_LABEL[song.source.format]}
        </Text>
      </View>
      {info.subtitle ? <Text style={[styles.subtitle, { color: palette.text }]}>{info.subtitle}</Text> : null}
      <Text numberOfLines={1} style={[styles.credits, { color: palette.muted }]}>
        {[...credits, plural(song.tracks.length, 'track'), plural(song.measureHeaders.length, 'bar'), song.source.version].join('  ·  ')}
      </Text>
    </View>
  );
}

/** Memoized: it only changes with its own props, not with the cursor or the playing beat. */
export const SongHeader = memo(SongHeaderView);

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', flexShrink: 1 },
  badge: { marginLeft: 12, fontSize: 10, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  subtitle: { fontSize: 14, marginTop: 2 },
  credits: { fontSize: 12, marginTop: 6 },
});
