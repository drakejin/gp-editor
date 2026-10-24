import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { useT } from '../hooks/use-i18n';
import type { LayoutAction } from '../state/layout-edits';
import type { Palette } from '../theme';

interface SystemDesignButtonsProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The system's first bar and how many bars it holds. */
  readonly firstMeasureIndex: number;
  readonly barCount: number;
  readonly onEdit: (action: LayoutAction) => void;
}

interface SmallButtonProps {
  readonly palette: Palette;
  readonly label: string;
  readonly tooltip: string;
  readonly isEnabled: boolean;
  readonly isLit?: boolean;
  readonly onPress: () => void;
}

function SmallButton({ palette, label, tooltip, isEnabled, isLit = false, onPress }: SmallButtonProps) {
  return (
    <Pressable
      accessibilityLabel={tooltip}
      tooltip={tooltip}
      disabled={!isEnabled}
      onPress={onPress}
      style={[styles.button, { borderColor: palette.border, backgroundColor: isLit ? palette.selection : palette.paper }, isEnabled ? null : styles.disabled]}
    >
      <Text style={[styles.label, { color: isLit ? palette.danger : palette.accent }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Guitar Pro 8's Design Mode buttons beside a system: + takes the next system's first bar into it, − gives its last bar
 * to the next system (both fix the system's bars), × puts its bars back as the layout lays them out.
 */
function SystemDesignButtonsView({ palette, song, firstMeasureIndex, barCount, onEdit }: SystemDesignButtonsProps) {
  const t = useT();
  const measureIndexes = Array.from({ length: barCount }, (_, i) => firstMeasureIndex + i);
  // + takes the next system's first bar in; × is lit while a bar of the system was laid out by hand.
  const hasBarsAfter = firstMeasureIndex + barCount < song.measureHeaders.length;
  const isDesigned = measureIndexes.some((index) => song.measureHeaders[index]?.design !== undefined);
  return (
    <View style={styles.column}>
      <SmallButton palette={palette} label="+" tooltip={t('stylesheet.design.moreBars')} isEnabled={hasBarsAfter} onPress={() => onEdit({ type: 'setSystemSize', measureIndex: firstMeasureIndex, bars: barCount + 1 })} />
      <SmallButton palette={palette} label="−" tooltip={t('stylesheet.design.fewerBars')} isEnabled={barCount > 1} onPress={() => onEdit({ type: 'setSystemSize', measureIndex: firstMeasureIndex, bars: barCount - 1 })} />
      <SmallButton palette={palette} label="×" tooltip={t('stylesheet.design.resetSystem')} isEnabled={isDesigned} isLit={isDesigned} onPress={() => onEdit({ type: 'resetPositions', measureIndexes })} />
    </View>
  );
}

export const SystemDesignButtons = memo(SystemDesignButtonsView);

/** The buttons' column, in the page's left margin. */
export const SYSTEM_BUTTONS_WIDTH = 18;

const styles = StyleSheet.create({
  column: { position: 'absolute', left: 3, top: 4, width: SYSTEM_BUTTONS_WIDTH, gap: 2 },
  button: { height: 15, borderWidth: StyleSheet.hairlineWidth, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '700', lineHeight: 13 },
  disabled: { opacity: 0.35 },
});
