import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../hooks/use-i18n';
import { type AppSettings, CONTRASTS, PAPER_SETTINGS } from '../../lib/app-settings';
import { LANGUAGE_SETTINGS } from '../../lib/i18n/language-setting';
import type { SettingsSnapshot } from '../../state/settings-store';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';

interface SettingsPanelProps {
  readonly palette: Palette;
  readonly snapshot: SettingsSnapshot;
  readonly onChange: (change: Partial<AppSettings>) => void;
  /** Close, Esc and a click outside. */
  readonly onClose: () => void;
}

interface ChoiceRowProps<T extends string> {
  readonly palette: Palette;
  readonly label: string;
  readonly hint: string;
  readonly choices: readonly T[];
  readonly value: T;
  readonly choiceLabel: (choice: T) => string;
  readonly onChoose: (choice: T) => void;
}

/** A setting: its name, one button per choice (the chosen one lit) and a line saying what it does. */
function ChoiceRow<T extends string>({ palette, label, hint, choices, value, choiceLabel, onChoose }: ChoiceRowProps<T>) {
  return (
    <View style={styles.setting}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.chromeText }]}>{label}</Text>
        <View style={styles.choices}>
          {choices.map((choice) => (
            <ChromeButton key={choice} palette={palette} label={choiceLabel(choice)} tooltip={choiceLabel(choice)} minWidth={64} isActive={choice === value} onPress={() => onChoose(choice)} />
          ))}
        </View>
      </View>
      <Text style={[styles.hint, { color: palette.chromeMuted }]}>{hint}</Text>
    </View>
  );
}

/**
 * GP Editor ▸ Settings… (⌘,): the language (the system's, English or 한국어 — the window changes at once), the interface
 * contrast and the score paper's colour. Each change is kept in user defaults and shown live.
 */
export function SettingsPanel({ palette, snapshot, onChange, onClose }: SettingsPanelProps) {
  const t = useT();
  const { settings, systemLanguage, needsRestart, error } = snapshot;
  const languageLabel = (choice: (typeof LANGUAGE_SETTINGS)[number]) =>
    choice === 'system' ? t('settings.language.system', { language: t(`settings.language.${systemLanguage}`) }) : t(`settings.language.${choice}`);
  return (
    <View style={styles.overlay}>
      <Pressable testID="settings-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t('settings.accessibility')}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: palette.chromeText }]}>{t('settings.title')}</Text>
          <View style={styles.gap} />
          <ChromeButton palette={palette} label={t('common.close')} tooltip={t('settings.closeTooltip')} minWidth={64} onPress={onClose} />
        </View>
        <Text style={[styles.section, { color: palette.chromeMuted }]}>{t('settings.section.language')}</Text>
        <ChoiceRow
          palette={palette}
          label={t('settings.language')}
          hint={needsRestart ? `${t('settings.language.hint')} ${t('settings.language.restart')}` : t('settings.language.hint')}
          choices={LANGUAGE_SETTINGS}
          value={settings.language}
          choiceLabel={languageLabel}
          onChoose={(language) => onChange({ language })}
        />
        <Text style={[styles.section, { color: palette.chromeMuted }]}>{t('settings.section.display')}</Text>
        <ChoiceRow
          palette={palette}
          label={t('settings.contrast')}
          hint={t('settings.contrast.hint')}
          choices={CONTRASTS}
          value={settings.contrast}
          choiceLabel={(contrast) => t(`settings.contrast.${contrast}`)}
          onChoose={(contrast) => onChange({ contrast })}
        />
        <ChoiceRow
          palette={palette}
          label={t('settings.paper')}
          hint={t('settings.paper.hint')}
          choices={PAPER_SETTINGS}
          value={settings.paper}
          choiceLabel={(paper) => t(`settings.paper.${paper}`)}
          onChoose={(paper) => onChange({ paper })}
        />
        {error !== undefined ? <Text style={[styles.hint, { color: palette.chromeDanger ?? palette.danger }]}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  panel: { width: 560, borderRadius: 10, borderWidth: 1, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800' },
  gap: { flex: 1 },
  section: { fontSize: 11, fontWeight: '700', marginTop: 14, marginBottom: 4 },
  setting: { marginTop: 6 },
  label: { fontSize: 12, fontWeight: '600', width: 120 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, columnGap: 4, rowGap: 4 },
  hint: { fontSize: 11, marginTop: 4, marginLeft: 120 },
});
