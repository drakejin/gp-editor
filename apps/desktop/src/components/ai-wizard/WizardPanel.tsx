import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useT } from '../../hooks/use-i18n';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';

// The frame of the AI Wizard's panels over the score (Compose from Here, AI Edit): title, close, the fields, a footer
// with the status line and the panel's buttons; and the result block they show when a run is done.

/** Warnings a result lists before "…". */
const MAX_SHOWN_WARNINGS = 6;

export interface WizardPanelProps {
  readonly palette: Palette;
  readonly title: string;
  readonly subtitle: string;
  readonly closeTooltip: string;
  readonly backdropTestID: string;
  /** While Claude works, a click outside does not close the panel. */
  readonly isRunning: boolean;
  readonly status: string;
  readonly isStatusError: boolean;
  /** The footer's buttons, after the status line. */
  readonly buttons: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

/** A dark panel in the middle of the window over a dimmed score. */
export function WizardPanel(props: WizardPanelProps) {
  const { palette } = props;
  const t = useT();
  return (
    <View style={styles.overlay}>
      <Pressable testID={props.backdropTestID} style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={props.isRunning ? undefined : props.onClose} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={props.title}>
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: palette.chromeText }]}>{props.title}</Text>
            <Text style={[styles.subtitle, { color: palette.chromeMuted }]}>{props.subtitle}</Text>
          </View>
          <ChromeButton palette={palette} label={t('common.close')} tooltip={props.closeTooltip} onPress={props.onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>{props.children}</ScrollView>
        <View style={[styles.footer, { borderColor: palette.chromeBorder }]}>
          <Text style={[styles.status, { color: props.isStatusError ? palette.danger : palette.chromeMuted }]}>{props.status}</Text>
          {props.buttons}
        </View>
      </View>
    </View>
  );
}

export interface WizardResultProps {
  readonly palette: Palette;
  readonly summary: string;
  /** What Claude read and what it cost; empty for none. */
  readonly detail: string;
  readonly warnings: readonly string[];
}

/** What a run wrote: the summary, a detail line, and the first warnings. */
export function WizardResult({ palette, summary, detail, warnings }: WizardResultProps) {
  const shown = warnings.slice(0, MAX_SHOWN_WARNINGS);
  return (
    <View style={[styles.result, { borderColor: palette.chromeBorder }]} accessibilityLabel={summary}>
      <Text style={[styles.summary, { color: palette.chromeText }]}>{summary}</Text>
      {detail === '' ? null : <Text style={[styles.detail, { color: palette.chromeMuted }]}>{detail}</Text>}
      {shown.map((warning, index) => (
        <Text key={index} style={[styles.detail, { color: palette.chromeMuted }]}>{`• ${warning}`}</Text>
      ))}
      {warnings.length > shown.length ? <Text style={[styles.detail, { color: palette.chromeMuted }]}>…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  panel: { width: 680, maxHeight: '92%', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  titles: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  result: { borderTopWidth: 1, paddingTop: 8, marginBottom: 8, rowGap: 3 },
  summary: { fontSize: 13, fontWeight: '700' },
  detail: { fontSize: 11 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, columnGap: 6 },
  status: { flex: 1, fontSize: 12 },
});
