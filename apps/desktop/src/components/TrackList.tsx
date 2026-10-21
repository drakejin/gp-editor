import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Track } from '@gp-editor/core';
import { tuningLabel } from '../lib/pitch';
import type { Palette } from '../theme';

interface TrackListProps {
  readonly tracks: readonly Track[];
  readonly selectedTrackIndex: number;
  readonly palette: Palette;
  readonly onSelectTrack: (trackIndex: number) => void;
}

export function TrackList({ tracks, selectedTrackIndex, palette, onSelectTrack }: TrackListProps) {
  return (
    <ScrollView style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <Text style={[styles.heading, { color: palette.muted }]}>TRACKS</Text>
      {tracks.map((track, trackIndex) => {
        const isSelected = trackIndex === selectedTrackIndex;
        const details = [
          track.isPercussion ? 'drums' : tuningLabel(track.strings.map((s) => s.tuning)),
          `${track.strings.length} str`,
          track.offset > 0 ? `capo ${track.offset}` : undefined,
        ].filter((part): part is string => part !== undefined);
        return (
          <Pressable
            key={track.number}
            onPress={() => onSelectTrack(trackIndex)}
            style={[styles.item, isSelected ? { backgroundColor: palette.selection } : null]}
          >
            <View style={[styles.swatch, { backgroundColor: `rgb(${track.color.r},${track.color.g},${track.color.b})` }]} />
            <View style={styles.texts}>
              <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>
                {track.number}. {track.name || 'Untitled'}
              </Text>
              <Text numberOfLines={1} style={[styles.details, { color: palette.muted }]}>
                {details.join(' · ')}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ScrollView grows by default; the sidebar keeps its width.
  container: { width: 240, flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, marginHorizontal: 6, borderRadius: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5, marginRight: 9 },
  texts: { flex: 1 },
  name: { fontSize: 13, fontWeight: '600' },
  details: { fontSize: 11, marginTop: 2 },
});
