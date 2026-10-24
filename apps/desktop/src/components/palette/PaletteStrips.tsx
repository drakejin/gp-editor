import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextField } from '../TextField';
import { useT } from '../../hooks/use-i18n';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import type { PaletteContext, PaletteOption, PaletteRun } from './palette-tools';

interface PaletteOptionStripProps {
  readonly palette: Palette;
  readonly options: readonly PaletteOption[];
  readonly context: PaletteContext;
  readonly onChoose: (edit: SongEdit) => void;
}

/** A tool's choices under its group (bend presets, slide kinds, tuplet sizes …); the cursor's current one is lit. */
export function PaletteOptionStrip({ palette, options, context, onChoose }: PaletteOptionStripProps) {
  return (
    <View style={[styles.strip, { backgroundColor: palette.chromeDeep }]}>
      {options.map((option) => (
        <ChromeButton
          key={option.label}
          palette={palette}
          label={option.label}
          tooltip={option.tooltip}
          fontSize={11}
          isActive={option.isActive?.(context) ?? false}
          onPress={() => onChoose(option.edit)}
        />
      ))}
    </View>
  );
}

interface PaletteTextFieldProps {
  readonly palette: Palette;
  readonly run: Extract<PaletteRun, { kind: 'text' }>;
  readonly context: PaletteContext;
  readonly onChoose: (edit: SongEdit) => void;
}

/** A text field under its group (a section name, text above a beat); Return or Set applies it, empty removes it. */
export function PaletteTextField({ palette, run, context, onChoose }: PaletteTextFieldProps) {
  const t = useT();
  const [draft, setDraft] = useState(run.value(context));
  const apply = () => onChoose(run.edit(draft));
  return (
    <View style={[styles.strip, { backgroundColor: palette.chromeDeep }]}>
      <TextField
        value={draft}
        placeholder={run.placeholder}
        placeholderTextColor={palette.chromeMuted}
        onChangeText={setDraft}
        onSubmitEditing={apply}
        autoFocus
        accessibilityLabel={run.placeholder}
        style={[styles.input, { color: palette.chromeText, backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}
      />
      <ChromeButton palette={palette} label={t('palette.set')} tooltip={t('common.apply')} onPress={apply} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4, padding: 3, borderRadius: 5 },
  input: { flex: 1, minWidth: 120, height: 22, fontSize: 12, paddingHorizontal: 6, borderRadius: 4, borderWidth: 1, marginRight: 4 },
});
