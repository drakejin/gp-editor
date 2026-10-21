import { useCallback, useMemo, useState } from 'react';
import { FlatList, type LayoutChangeEvent, type ListRenderItemInfo, StyleSheet, View } from 'react-native';
import type { NoteAddress, Song } from '@gp-editor/core';
import { type RowLayout, TAB, layoutMeasure, layoutRows, staffHeight, stringY } from '../lib/layout';
import type { Palette } from '../theme';
import { TabMeasure } from './TabMeasure';

interface TabScoreProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly selection?: NoteAddress;
  readonly palette: Palette;
  readonly onSelectNote: (address: NoteAddress) => void;
}

const SIDE_PADDING = 24;

export function TabScore({ song, trackIndex, selection, palette, onSelectNote }: TabScoreProps) {
  const [width, setWidth] = useState(0);
  const track = song.tracks[trackIndex];
  const measures = useMemo(
    () => song.measureHeaders.map((_, measureIndex) => layoutMeasure(song, trackIndex, measureIndex)),
    [song, trackIndex],
  );
  const rows = useMemo(
    () => (width > 0 ? layoutRows(measures, width - SIDE_PADDING * 2) : []),
    [measures, width],
  );
  const rowHeight = staffHeight(track?.strings.length ?? 6) + TAB.rowGap;
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<RowLayout>) => {
      if (track === undefined) {
        return null;
      }
      const stringCount = track.strings.length;
      return (
        <View style={[styles.row, { height: rowHeight }]}>
          <View
            style={[styles.rowStart, { top: stringY(1), height: (stringCount - 1) * TAB.stringGap, backgroundColor: palette.text }]}
          />
          {item.measures.map((layout) => {
            const header = song.measureHeaders[layout.measureIndex];
            return header === undefined ? null : (
              <TabMeasure
                key={layout.measureIndex}
                track={track}
                trackIndex={trackIndex}
                header={header}
                layout={layout}
                selection={selection?.measure === layout.measureIndex ? selection : undefined}
                palette={palette}
                onSelectNote={onSelectNote}
              />
            );
          })}
        </View>
      );
    },
    [track, trackIndex, song.measureHeaders, selection, palette, onSelectNote, rowHeight],
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.paper }]} onLayout={onLayout}>
      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={(row) => String(row.measures[0]?.measureIndex ?? 0)}
        getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
        extraData={selection}
        contentContainerStyle={styles.content}
        initialNumToRender={8}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: SIDE_PADDING, paddingVertical: 16 },
  row: { flexDirection: 'row' },
  rowStart: { position: 'absolute', left: 0, width: 1 },
});
