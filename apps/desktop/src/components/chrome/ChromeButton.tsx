import { type ReactNode, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text } from 'react-native';
import type { Palette } from '../../theme';

/** A button's room beside its label (a fixed width keeps less) and its gap to the next button, in points. */
export const CHROME_BUTTON_SPACING = { padding: 5, fixedPadding: 2, margin: 1 } as const;

export interface ChromeButtonProps {
  readonly palette: Palette;
  /** What the button says, or its icon when `icon` is not given. */
  readonly label: string;
  readonly icon?: ReactNode;
  /** Shown on hover; also the accessibility label. */
  readonly tooltip: string;
  readonly onPress: (event: GestureResponderEvent) => void;
  readonly isActive?: boolean;
  readonly isEnabled?: boolean;
  /** e.g. 'Bravura' for music symbols. */
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly minWidth?: number;
  /** A fixed width (an even grid of tools); the label is cut short if it does not fit. */
  readonly width?: number;
  /** Height when not the chrome's 26 points (the edition palette's compact rows). */
  readonly height?: number;
  readonly testID?: string;
}

/** A button on the dark chrome (top bar, edition palette, inspector, tracks panel), as Guitar Pro draws them. */
export function ChromeButton(props: ChromeButtonProps) {
  const { palette, label, icon, tooltip, onPress, isActive = false, isEnabled = true, fontFamily, fontSize = 12, minWidth = 26, width, height } = props;
  const [isHovered, setIsHovered] = useState(false);
  const background = isActive ? palette.chromeAccent : isHovered && isEnabled ? palette.chromeRaised : 'transparent';
  const color = isActive ? palette.chromeAccentText : palette.chromeText;
  return (
    <Pressable
      testID={props.testID}
      disabled={!isEnabled}
      onPress={onPress}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      tooltip={tooltip}
      accessibilityLabel={tooltip}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive, disabled: !isEnabled }}
      style={[styles.button, width === undefined ? { minWidth } : [styles.fixedWidth, { width }], height === undefined ? null : { height }, { backgroundColor: background }, isEnabled ? null : styles.disabled]}
    >
      {icon ?? (
        <Text numberOfLines={1} style={[styles.label, { color, fontSize, fontFamily }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 26, paddingHorizontal: CHROME_BUTTON_SPACING.padding, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginHorizontal: CHROME_BUTTON_SPACING.margin },
  fixedWidth: { paddingHorizontal: CHROME_BUTTON_SPACING.fixedPadding },
  disabled: { opacity: 0.35 },
  label: { fontWeight: '600' },
});
