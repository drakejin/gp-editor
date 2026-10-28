import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_REFERENCE_A4, MIN_REFERENCE_A4, type TunerReading, toTunerReading } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { type TunerStrings, centsText, frequencyText, isInTune, noteParts, stringButtons, tunerStatusText } from '../../lib/tuner-display';
import type { TunerStatus } from '../../lib/tuner-input';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { CentsNeedle, IN_TUNE_COLOR, LevelMeter, OUT_OF_TUNE_COLOR } from './TunerMeters';

export interface TunerViewProps {
  readonly palette: Palette;
  readonly status: TunerStatus;
  readonly levelDb: number;
  /** The pitch heard; undefined while nothing is played. */
  readonly frequency?: number;
  readonly referenceA4: number;
  readonly strings: TunerStrings;
  readonly onShiftReferenceA4: (delta: number) => void;
  readonly onClose: () => void;
}

/** The big note name with its octave, the cents off it and the frequency; dashes while nothing is played. */
function NoteDisplay({ palette, reading }: { readonly palette: Palette; readonly reading?: TunerReading }) {
  const parts = reading === undefined ? undefined : noteParts(reading.note);
  const color = reading === undefined ? palette.chromeMuted : isInTune(reading.cents) ? IN_TUNE_COLOR : OUT_OF_TUNE_COLOR;
  return (
    <View style={styles.note}>
      <View style={styles.noteName}>
        <Text style={[styles.name, { color }]}>{parts?.name ?? '–'}</Text>
        <Text style={[styles.octave, { color }]}>{parts === undefined ? '' : String(parts.octave)}</Text>
      </View>
      <View style={styles.noteFigures}>
        <Text style={[styles.cents, { color }]}>{reading === undefined ? '' : centsText(reading.cents)}</Text>
        <Text style={[styles.frequency, { color: palette.chromeMuted }]}>{reading === undefined ? '– Hz' : frequencyText(reading.frequency)}</Text>
      </View>
    </View>
  );
}

/** The track's strings from the lowest; the one nearest the note is lit and says how far off it is. */
function StringRow({ palette, strings, reading }: { readonly palette: Palette; readonly strings: TunerStrings; readonly reading?: TunerReading }) {
  const t = useT();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('tools.tuner.strings')}</Text>
      <View style={styles.strings}>
        {stringButtons(strings.tuning, reading).map((button) => (
          <View
            key={button.number}
            accessibilityLabel={t('tools.tuner.string', { number: button.number, name: button.label, nearest: button.cents === undefined ? '' : t('tools.tuner.nearest', { cents: centsText(button.cents) }) })}
            style={[styles.string, { backgroundColor: button.isNearest ? palette.chromeAccent : palette.chromeRaised }]}
          >
            <Text style={[styles.stringName, { color: button.isNearest ? palette.chromeAccentText : palette.chromeText }]}>{button.label}</Text>
            <Text style={[styles.stringCents, { color: button.isNearest ? palette.chromeAccentText : palette.chromeMuted }]}>
              {button.cents === undefined ? ' ' : centsText(button.cents)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReferenceRow({ palette, referenceA4, onShiftReferenceA4 }: Pick<TunerViewProps, 'palette' | 'referenceA4' | 'onShiftReferenceA4'>) {
  const t = useT();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('tools.tuner.reference')}</Text>
      <ChromeButton palette={palette} label="−" tooltip={t('tools.tuner.referenceLower')} minWidth={26} isEnabled={referenceA4 > MIN_REFERENCE_A4} onPress={() => onShiftReferenceA4(-1)} />
      {/* i18n-exempt: a pitch and its unit */}
      <Text style={[styles.reference, { color: palette.chromeText }]}>{`A4 = ${referenceA4} Hz`}</Text>
      <ChromeButton palette={palette} label="+" tooltip={t('tools.tuner.referenceRaise')} minWidth={26} isEnabled={referenceA4 < MAX_REFERENCE_A4} onPress={() => onShiftReferenceA4(1)} />
    </View>
  );
}

/**
 * Tools ▸ Tuner…: the note the microphone hears, how many cents it is off (green within 5), its frequency, the shown
 * track's strings with the nearest one lit, the input level and the reference A4. One note at a time.
 */
export function TunerView(props: TunerViewProps) {
  const { palette, status, frequency, strings } = props;
  const reading = frequency === undefined ? undefined : toTunerReading(frequency, strings.tuning, props.referenceA4);
  const isProblem = status.kind === 'denied' || status.kind === 'failed';
  const t = useT();
  return (
    <View style={styles.overlay}>
      <Pressable testID="tuner-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={props.onClose} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t('tools.tuner.title')}>
        <View style={[styles.header, { borderColor: palette.chromeBorder }]}>
          <View style={styles.titles}>
            <Text style={[styles.title, { color: palette.chromeText }]}>{t('tools.tuner.title')}</Text>
            <Text style={[styles.subtitle, { color: palette.chromeMuted }]}>{strings.caption}</Text>
          </View>
          <ChromeButton palette={palette} label={t('common.close')} tooltip={t('tools.tuner.closeTooltip')} onPress={props.onClose} />
        </View>
        <View style={styles.body}>
          <NoteDisplay palette={palette} reading={reading} />
          <CentsNeedle palette={palette} cents={reading?.cents} />
          <StringRow palette={palette} strings={strings} reading={reading} />
          <View style={styles.row}>
            <Text style={[styles.label, { color: palette.chromeMuted }]}>{t('tools.tuner.input')}</Text>
            <LevelMeter palette={palette} levelDb={props.levelDb} />
          </View>
          <ReferenceRow palette={palette} referenceA4={props.referenceA4} onShiftReferenceA4={props.onShiftReferenceA4} />
        </View>
        <View style={[styles.footer, { borderColor: palette.chromeBorder }]}>
          <Text style={[styles.status, { color: isProblem ? palette.danger : palette.chromeMuted }]}>{tunerStatusText(status, reading !== undefined)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  panel: { width: 520, borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  titles: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, rowGap: 12 },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 18, height: 96 },
  noteName: { flexDirection: 'row', alignItems: 'flex-end', minWidth: 110, justifyContent: 'flex-end' },
  name: { fontSize: 72, fontWeight: '800', lineHeight: 84 },
  octave: { fontSize: 26, fontWeight: '700', marginBottom: 10, marginLeft: 2, minWidth: 18 },
  noteFigures: { minWidth: 110 },
  cents: { fontSize: 24, fontWeight: '700' },
  frequency: { fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { width: 78, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  strings: { flex: 1, flexDirection: 'row', columnGap: 6 },
  string: { flex: 1, borderRadius: 5, paddingVertical: 4, alignItems: 'center' },
  stringName: { fontSize: 13, fontWeight: '700' },
  stringCents: { fontSize: 10, marginTop: 1 },
  reference: { fontSize: 12, fontWeight: '600', marginHorizontal: 8, minWidth: 86, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  status: { fontSize: 12 },
});
