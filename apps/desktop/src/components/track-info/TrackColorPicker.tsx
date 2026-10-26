import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Rgb, TRACK_COLORS } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { hexColorText, isSameColor, parseHexColor } from '../../lib/track-color';
import type { Palette } from '../../theme';
import { TextField } from '../TextField';

/** A swatch's side and the room between two, in points. */
export const SWATCH = { size: 24, gap: 6 } as const;

export interface TrackColorPickerProps {
  readonly palette: Palette;
  readonly color: Rgb;
  /** A swatch or a typed colour: one undo step. */
  readonly onChange: (color: Rgb) => void;
}

/** Guitar Pro 8's track colours as swatches, the track's ringed, and any colour typed as #RRGGBB. */
export function TrackColorPicker({ palette, color, onChange }: TrackColorPickerProps) {
  const t = useT();
  return (
    <View>
      <View style={styles.swatches}>
        {TRACK_COLORS.map((swatch) => {
          const hex = hexColorText(swatch);
          const isChosen = isSameColor(swatch, color);
          return (
            <Pressable
              key={hex}
              onPress={() => onChange(swatch)}
              tooltip={t('window.trackInfo.colorSwatch', { hex })}
              accessibilityRole="button"
              accessibilityLabel={t('window.trackInfo.colorSwatch', { hex })}
              accessibilityState={{ selected: isChosen }}
              style={[styles.swatch, { backgroundColor: hex, borderColor: isChosen ? palette.chromeText : palette.chromeBorder }, isChosen ? styles.chosen : null]}
            />
          );
        })}
      </View>
      <View style={styles.custom}>
        <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('window.trackInfo.custom')}</Text>
        <View style={[styles.current, { backgroundColor: hexColorText(color), borderColor: palette.chromeBorder }]} />
        <CustomColorField palette={palette} color={color} onChange={onChange} />
      </View>
    </View>
  );
}

/** The colour as #RRGGBB: Return or leaving the field sets a valid one; anything else goes back to the track's. */
function CustomColorField({ palette, color, onChange }: TrackColorPickerProps) {
  const t = useT();
  const shown = hexColorText(color);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const typed = parseHexColor(draft);
    if (typed === undefined || isSameColor(typed, color)) {
      setDraft(shown);
    } else {
      onChange(typed);
    }
  };
  return (
    <TextField
      value={draft}
      onChangeText={setDraft}
      onSubmitEditing={commit}
      onBlur={commit}
      tooltip={t('window.trackInfo.customTooltip')}
      accessibilityLabel={t('window.trackInfo.custom')}
      style={[styles.field, { color: palette.chromeText, backgroundColor: palette.chromeDeep, borderColor: palette.chromeBorder }]}
    />
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: SWATCH.gap },
  swatch: { width: SWATCH.size, height: SWATCH.size, borderRadius: 5, borderWidth: 1 },
  chosen: { borderWidth: 2 },
  custom: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  label: { fontSize: 11 },
  current: { width: 16, height: 16, borderRadius: 3, borderWidth: 1 },
  field: { width: 84, height: 22, fontSize: 12, paddingHorizontal: 6, borderRadius: 4, borderWidth: 1 },
});
