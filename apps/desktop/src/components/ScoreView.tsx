import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, type LayoutChangeEvent, type ListRenderItemInfo, StyleSheet, View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { type RowLayout, layoutMeasure, layoutRows } from '../lib/layout';
import { ROW, type ScoreMode, rowGeometry } from '../score/geometry';
import type { RowHit } from '../score/hit-test';
import { type PlayingBeat, rowHeaderWidth } from '../score/row';
import type { Palette } from '../theme';
import { ScoreRow } from './ScoreRow';

interface ScoreViewProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  readonly palette: Palette;
  readonly onPressBeat: (hit: RowHit) => void;
}

/** Rows rendered at once and kept around the viewport. */
const INITIAL_ROWS = 6;
const WINDOW_SIZE = 5;

export function ScoreView({ song, trackIndex, mode, cursor, playing, palette, onPressBeat }: ScoreViewProps) {
  const [width, setWidth] = useState(0);
  const listRef = useRef<FlatList<RowLayout>>(null);
  const track = song.tracks[trackIndex];
  const stringCount = track?.strings.length ?? 6;
  const headerWidth = useMemo(() => (track === undefined ? 0 : rowHeaderWidth(mode, track)), [mode, track]);
  const geometry = useMemo(() => rowGeometry(mode, stringCount), [mode, stringCount]);
  const measures = useMemo(() => song.measureHeaders.map((_, i) => layoutMeasure(song, trackIndex, i)), [song, trackIndex]);
  const rowWidth = Math.max(0, width - ROW.sidePadding * 2);
  const rows = useMemo(() => (rowWidth > 0 ? layoutRows(measures, rowWidth - headerWidth) : []), [measures, rowWidth, headerWidth]);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);

  const playingRow = playing === undefined ? -1 : rows.findIndex((row) => row.measures.some((m) => m.measureIndex === playing.measureIndex));
  useEffect(() => {
    if (playingRow >= 0) {
      listRef.current?.scrollToIndex({ index: playingRow, viewPosition: 0.25, animated: true });
    }
  }, [playingRow]);

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<RowLayout>) => {
      const inRow = (measureIndex: number | undefined) => item.measures.some((m) => m.measureIndex === measureIndex);
      return (
        <ScoreRow
          song={song}
          trackIndex={trackIndex}
          row={item}
          width={rowWidth}
          headerWidth={headerWidth}
          mode={mode}
          geometry={geometry}
          palette={palette}
          cursor={inRow(cursor?.measureIndex) ? cursor : undefined}
          playing={inRow(playing?.measureIndex) ? playing : undefined}
          onPress={onPressBeat}
        />
      );
    },
    [song, trackIndex, rowWidth, headerWidth, mode, geometry, palette, cursor, playing, onPressBeat],
  );

  return (
    <View style={[styles.container, { backgroundColor: palette.paper }]} onLayout={onLayout}>
      <FlatList
        ref={listRef}
        data={rows}
        renderItem={renderRow}
        keyExtractor={(row) => String(row.measures[0]?.measureIndex ?? 0)}
        getItemLayout={(_, index) => ({ length: geometry.height, offset: geometry.height * index, index })}
        extraData={renderRow}
        contentContainerStyle={styles.content}
        initialNumToRender={INITIAL_ROWS}
        windowSize={WINDOW_SIZE}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: ROW.sidePadding, paddingVertical: 12 },
});
