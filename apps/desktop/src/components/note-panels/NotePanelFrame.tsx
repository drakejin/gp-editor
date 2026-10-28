import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../hooks/use-i18n';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';

interface NotePanelFrameProps {
  readonly palette: Palette;
  readonly title: string;
  readonly subtitle: string;
  /** What Done says on hover; "Close" (common.close) by default. */
  readonly closeTooltip?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A dark panel over the window for one note's setting (vibrato, bend, tremolo bar); Done or a click outside closes it. */
export function NotePanelFrame({
  palette,
  title,
  subtitle,
  closeTooltip,
  onClose,
  children,
}: NotePanelFrameProps) {
  const t = useT();
  return (
    <View style={styles.overlay}>
      <Pressable
        testID="note-panel-backdrop"
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        onPress={onClose}
      />
      <View
        style={[
          styles.panel,
          {
            backgroundColor: palette.chrome,
            borderColor: palette.chromeBorder,
          },
        ]}
        accessibilityLabel={title}
      >
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: palette.chromeText }]}>
              {title}
            </Text>
            <Text style={[styles.subtitle, { color: palette.chromeMuted }]}>
              {subtitle}
            </Text>
          </View>
          <ChromeButton
            palette={palette}
            label={t('common.done')}
            tooltip={closeTooltip ?? t('common.close')}
            onPress={onClose}
          />
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

/** A row of choices inside a note panel, the current one lit. */
export function ChoiceRow<T extends string | number>({
  palette,
  label,
  choices,
  current,
  onChoose,
}: {
  readonly palette: Palette;
  readonly label: string;
  readonly choices: readonly {
    readonly value: T;
    readonly label: string;
    readonly tooltip: string;
  }[];
  readonly current: T | undefined;
  readonly onChoose: (value: T) => void;
}) {
  return (
    <View style={styles.choiceRow}>
      <Text style={[styles.choiceLabel, { color: palette.chromeMuted }]}>
        {label}
      </Text>
      <View style={styles.choices}>
        {choices.map(choice => (
          <ChromeButton
            key={String(choice.value)}
            palette={palette}
            label={choice.label}
            tooltip={choice.tooltip}
            isActive={choice.value === current}
            onPress={() => onChoose(choice.value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  panel: { width: 520, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  titles: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  body: { padding: 16, rowGap: 12 },
  choiceRow: { flexDirection: 'row', alignItems: 'flex-start' },
  choiceLabel: { width: 70, fontSize: 11, fontWeight: '700', paddingTop: 6 },
  choices: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
});
