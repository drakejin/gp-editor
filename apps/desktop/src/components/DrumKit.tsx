import { useCallback, useMemo, useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import type { DrumKey } from '../hooks/use-drum-key';
import { useLanguage, useT } from '../hooks/use-i18n';
import { ScoreCanvas } from '../native/score-canvas';
import { drumKitHeight, engraveDrumKit, hitTestDrumKit } from '../score/drum-kit';
import type { Palette } from '../theme';
import { ChromeButton } from './chrome/ChromeButton';

interface DrumKitProps {
  /** General MIDI keys to light: the playing beat's drums while playing, else the cursor's beat's. */
  readonly keys: readonly number[];
  readonly palette: Palette;
  /** A piece was clicked: the drum it enters. */
  readonly onHit: (key: number) => void;
  /** View ▸ Drum Key: how these drums are written on the staff, shown or hidden by the kit's button. */
  readonly drumKey?: Pick<DrumKey, 'isOpen' | 'toggle'>;
}

const SIDE_PADDING = 24;

/** A drum kit seen from above, in the instrument view of a drum track: the sounding drums lit, a click enters one. */
export function DrumKit({ keys, palette, onHit, drumKey }: DrumKitProps) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width - SIDE_PADDING * 2), []);
  const t = useT();
  const language = useLanguage();
  // The drums' names are drawn in the shown language: drawn again when it changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const commands = useMemo(() => (width > 0 ? engraveDrumKit({ width, keys, palette }) : []), [width, keys, palette, language]);
  const height = drumKitHeight(Math.max(0, width));
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      const hit = hitTestDrumKit(width, event.nativeEvent.locationX, event.nativeEvent.locationY);
      if (hit !== undefined) {
        onHit(hit.key);
      }
    },
    [width, onHit],
  );
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} onLayout={onLayout}>
      <Pressable onPressIn={handlePress} tooltip={t('window.drumKit.tooltip')} accessibilityLabel={t('window.drumKit.title')} style={{ width: Math.max(0, width), height }}>
        <ScoreCanvas commands={commands} style={{ width: Math.max(0, width), height }} />
      </Pressable>
      {drumKey === undefined ? null : (
        <View style={styles.keyButton}>
          <ChromeButton palette={palette} label={t('drums.key.title')} tooltip={t('drums.key.openTooltip')} isActive={drumKey.isOpen} onPress={drumKey.toggle} testID="drum-kit-drum-key" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SIDE_PADDING, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  keyButton: { position: 'absolute', top: 6, right: 8 },
});
