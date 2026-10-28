import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../hooks/use-i18n';
import type { Palette } from '../../theme';

const MENU_WIDTH = 270;
const EDGE = 8;

interface ChromeMenuProps {
  readonly palette: Palette;
  /** Pointer x (window points) of the click that opened it. */
  readonly x: number;
  readonly top: number;
  /** Window width, so the menu stays inside it. */
  readonly windowWidth: number;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A dark drop-down menu over the whole window; a click outside closes it. */
export function ChromeMenu({ palette, x, top, windowWidth, onClose, children }: ChromeMenuProps) {
  const left = Math.max(EDGE, Math.min(x - 16, windowWidth - MENU_WIDTH - EDGE));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable testID="chrome-menu-backdrop" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.menu, { left, top, backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>{children}</View>
    </View>
  );
}

interface MenuItemProps {
  readonly palette: Palette;
  readonly label: string;
  readonly isChecked?: boolean;
  readonly onPress: () => void;
}

export function MenuItem({ palette, label, isChecked = false, onPress }: MenuItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      accessibilityRole="menuitem"
      style={[styles.item, isHovered ? { backgroundColor: palette.chromeAccent } : null]}
    >
      <Text style={[styles.check, { color: palette.chromeText }]}>{isChecked ? '✓' : ''}</Text>
      <Text style={[styles.itemText, { color: palette.chromeText }]}>{label}</Text>
    </Pressable>
  );
}

export function MenuSeparator({ palette }: { readonly palette: Palette }) {
  return <View style={[styles.separator, { backgroundColor: palette.chromeRaised }]} />;
}

export function MenuHeading({ palette, label }: { readonly palette: Palette; readonly label: string }) {
  return <Text style={[styles.heading, { color: palette.chromeMuted }]}>{label}</Text>;
}

interface MenuStepperProps {
  readonly palette: Palette;
  readonly label: string;
  readonly value: string;
  readonly onDecrease: () => void;
  readonly onIncrease: () => void;
  readonly tooltip: string;
}

/** "Label  [−] value [+]" inside a menu; it stays open while stepping. */
export function MenuStepper({ palette, label, value, onDecrease, onIncrease, tooltip }: MenuStepperProps) {
  const t = useT();
  return (
    <View style={styles.stepperRow} tooltip={tooltip}>
      <Text style={[styles.stepperLabel, { color: palette.chromeText }]}>{label}</Text>
      <MenuButton palette={palette} label="−" onPress={onDecrease} tooltip={t('window.menu.less', { what: tooltip })} />
      <Text style={[styles.stepperValue, { color: palette.chromeText }]}>{value}</Text>
      <MenuButton palette={palette} label="+" onPress={onIncrease} tooltip={t('window.menu.more', { what: tooltip })} />
    </View>
  );
}

export function MenuButton({ palette, label, onPress, tooltip }: { readonly palette: Palette; readonly label: string; readonly onPress: () => void; readonly tooltip: string }) {
  return (
    <Pressable onPress={onPress} tooltip={tooltip} accessibilityLabel={tooltip} style={[styles.button, { backgroundColor: palette.chromeRaised }]}>
      <Text style={[styles.buttonText, { color: palette.chromeText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  item: { flexDirection: 'row', alignItems: 'center', height: 22, paddingHorizontal: 8, marginHorizontal: 4, borderRadius: 4 },
  check: { width: 16, fontSize: 12 },
  itemText: { fontSize: 13 },
  separator: { height: 1, marginVertical: 5, marginHorizontal: 8 },
  heading: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 12, paddingTop: 2, paddingBottom: 3 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', height: 26, paddingHorizontal: 12 },
  stepperLabel: { flex: 1, fontSize: 12 },
  stepperValue: { minWidth: 64, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  button: { minWidth: 24, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginHorizontal: 2 },
  buttonText: { fontSize: 12, fontWeight: '700' },
});
