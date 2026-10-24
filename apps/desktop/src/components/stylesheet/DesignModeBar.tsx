import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
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
  const t = useT();
  const header = cursorMeasureIndex === undefined ? undefined : song.measureHeaders[cursorMeasureIndex];
  const startsSystem = header?.design?.systemBars !== undefined;
  const isDesigned = song.measureHeaders.some((each) => each.design !== undefined);
  return (
    <View style={[styles.bar, { backgroundColor: palette.sidebar, borderColor: palette.border }]} accessibilityLabel={t('stylesheet.design.title')}>
      <Text style={[styles.title, { color: palette.text }]}>{t('stylesheet.design.title')}</Text>
      <Text style={[styles.hint, { color: palette.muted }]}>{t('stylesheet.design.hint')}</Text>
      {cursorMeasureIndex === undefined ? null : (
        <BarButton
          label={t(startsSystem ? 'stylesheet.design.noSystemStart' : 'stylesheet.design.newSystem', { number: cursorMeasureIndex + 1 })}
          palette={palette}
          isActive={startsSystem}
          onPress={() => onAction({ type: 'toggleSystemStart', measureIndex: cursorMeasureIndex })}
        />
      )}
      <BarButton label={t('stylesheet.design.resetPositions')} palette={palette} isEnabled={isDesigned} onPress={() => onAction({ type: 'resetPositions' })} />
      <BarButton label={t('common.done')} palette={palette} isAccent onPress={() => onAction({ type: 'toggleDesignMode' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  hint: { flexShrink: 1, fontSize: 11, marginRight: 12 },
});
