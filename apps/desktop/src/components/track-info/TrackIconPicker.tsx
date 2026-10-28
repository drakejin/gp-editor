import { Pressable, StyleSheet, View } from 'react-native';
import { TRACK_ICON_IDS, type TrackIconName } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import type { Palette } from '../../theme';
import { TrackIcon } from '../TrackIcon';

/** An icon's cell and the icon in it, in points. */
export const ICON_CELL = { size: 30, icon: 20, gap: 3 } as const;

/** Guitar Pro's icons in the picker's order: guitars, basses and other plucked strings, keys, orchestra, drums, other. */
const ICONS = Object.keys(TRACK_ICON_IDS) as TrackIconName[];

export interface TrackIconPickerProps {
  readonly palette: Palette;
  /** The icon the track shows. */
  readonly icon: TrackIconName;
  /** An icon chosen: the track shows it whatever its instrument (one undo step). */
  readonly onChange: (iconId: number) => void;
}

/** Guitar Pro 8's track icons in a grid, the track's lit. */
export function TrackIconPicker({ palette, icon, onChange }: TrackIconPickerProps) {
  const t = useT();
  return (
    <View style={styles.grid}>
      {ICONS.map((name) => {
        const isChosen = name === icon;
        const label = t(`window.trackIcon.${name}`);
        return (
          <Pressable
            key={name}
            onPress={() => onChange(TRACK_ICON_IDS[name])}
            tooltip={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isChosen }}
            style={[styles.cell, { borderColor: isChosen ? palette.chromeAccent : palette.chromeBorder }, isChosen ? { backgroundColor: palette.chromeAccent } : null]}
          >
            <TrackIcon icon={name} color={isChosen ? palette.chromeAccentText : palette.chromeText} size={ICON_CELL.icon} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: ICON_CELL.gap },
  cell: { width: ICON_CELL.size, height: ICON_CELL.size, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
