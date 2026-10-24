import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import type { EditorAction } from '../../state/editor';
import type { Palette } from '../../theme';
import { BarButton } from '../BarButton';

interface DesignModeBarProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The cursor's bar: where "New system here" starts one. */
  readonly cursorMeasureIndex?: number;
  readonly onAction: (action: EditorAction) => void;
}

/**
 * Design Mode's strip over the score (View ▸ Design Mode, the palette's ↔): what can be dragged, a system start at the
 * cursor's bar, Reset Positions (Guitar Pro 8's View ▸ Spacing Tools) and Done.
 */
export function DesignModeBar({ palette, song, cursorMeasureIndex, onAction }: DesignModeBarProps) {
  const header = cursorMeasureIndex === undefined ? undefined : song.measureHeaders[cursorMeasureIndex];
  const startsSystem = header?.design?.systemBars !== undefined;
  const isDesigned = song.measureHeaders.some((each) => each.design !== undefined);
  return (
    <View style={[styles.bar, { backgroundColor: palette.sidebar, borderColor: palette.border }]} accessibilityLabel="Design Mode">
      <Text style={[styles.title, { color: palette.text }]}>Design Mode</Text>
      <Text style={[styles.hint, { color: palette.muted }]}>
        Drag a beat’s dot or a bar line’s ▼ (a yellow guide snaps to the system above or below), the grips between staves and systems; + − × beside a system.
      </Text>
      {cursorMeasureIndex === undefined ? null : (
        <BarButton
          label={startsSystem ? `No system start at bar ${cursorMeasureIndex + 1}` : `New system at bar ${cursorMeasureIndex + 1}`}
          palette={palette}
          isActive={startsSystem}
          onPress={() => onAction({ type: 'toggleSystemStart', measureIndex: cursorMeasureIndex })}
        />
      )}
      <BarButton label="Reset Positions" palette={palette} isEnabled={isDesigned} onPress={() => onAction({ type: 'resetPositions' })} />
      <BarButton label="Done" palette={palette} isAccent onPress={() => onAction({ type: 'toggleDesignMode' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  hint: { flexShrink: 1, fontSize: 11, marginRight: 12 },
});
