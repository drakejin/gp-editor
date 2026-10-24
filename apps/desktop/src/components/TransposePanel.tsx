import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Translate, useT } from '../hooks/use-i18n';
import {
  type TranspositionDraft,
  type TranspositionTarget,
  clampTransposeAmount,
  clampTransposeOctaves,
  describeTransposition,
  initialTranspositionDraft,
  parseTransposeAmount,
  toTranspositionOptions,
} from '../state/transposition';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';
import { TextField } from './TextField';

interface TransposePanelProps {
  readonly palette: Palette;
  /** The shown track's name: what "Track" transposes. */
  readonly trackName: string;
  /** The selected beats, e.g. "4 beats from bars 3–4"; undefined without a selection. */
  readonly selection?: string;
  readonly onTranspose: (draft: TranspositionDraft) => void;
  readonly onClose: () => void;
}

const TARGETS: readonly TranspositionTarget[] = ['selection', 'track', 'song'];

function targetLabel(target: TranspositionTarget, trackName: string, t: Translate): string {
  switch (target) {
    case 'selection':
      return t('window.transpose.selection');
    case 'track':
      return trackName === '' ? t('common.track') : t('window.export.whatTrack', { name: trackName });
    case 'song':
      return t('common.wholeSong');
  }
}

interface StepperProps {
  readonly palette: Palette;
  readonly label: string;
  readonly onStep: (delta: -1 | 1) => void;
  readonly children: ReactNode;
}

function Stepper({ palette, label, onStep, children }: StepperProps) {
  return (
    <>
      <Text style={[styles.label, styles.spaced, { color: palette.text }]}>{label}</Text>
      <BarButton label="−" palette={palette} onPress={() => onStep(-1)} />
      {children}
      <BarButton label="+" palette={palette} onPress={() => onStep(1)} />
    </>
  );
}

/**
 * Tools ▸ Transpose…: by semitones or by steps of the key's scale, plus octaves; the selection, the shown track or the
 * whole song; chord names and diagrams with the notes or alone. One undo step; the hint strip tells what could not move.
 * (Guitar Pro's "keep the frets" has no place here: a note's pitch is its string and fret — the capo does that.)
 */
export function TransposePanel({ palette, trackName, selection, onTranspose, onClose }: TransposePanelProps) {
  const t = useT();
  const [draft, setDraft] = useState<TranspositionDraft>(() => initialTranspositionDraft(selection !== undefined));
  const [amountText, setAmountText] = useState(String(draft.amount));
  const change = (patch: Partial<TranspositionDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const stepAmount = (delta: -1 | 1) => {
    const amount = clampTransposeAmount(draft.amount + delta);
    change({ amount });
    setAmountText(String(amount));
  };
  const isChromatic = draft.mode === 'chromatic';
  const how = describeTransposition(toTranspositionOptions(draft));
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} accessibilityLabel={t('window.transpose.title')}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{t('window.transpose.title')}</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>{t('window.transpose.note')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>{t('window.transpose.by')}</Text>
        <BarButton label={t('window.transpose.semitones')} palette={palette} isActive={isChromatic} onPress={() => change({ mode: 'chromatic' })} />
        <BarButton label={t('window.transpose.scaleSteps')} palette={palette} isActive={!isChromatic} onPress={() => change({ mode: 'diatonic' })} />
        <Stepper palette={palette} label={t('window.transpose.amount')} onStep={stepAmount}>
          <TextField
            testID="transpose-amount"
            value={amountText}
            onChangeText={(text) => {
              setAmountText(text);
              change({ amount: parseTransposeAmount(text, draft.amount) });
            }}
            style={[styles.field, { color: palette.text, borderColor: palette.border }]}
          />
        </Stepper>
        <Stepper palette={palette} label={t('window.transpose.octaves')} onStep={(delta) => change({ octaves: clampTransposeOctaves(draft.octaves + delta) })}>
          <Text style={[styles.value, { color: palette.text }]}>{draft.octaves}</Text>
        </Stepper>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>{t('window.transpose.applyTo')}</Text>
        {TARGETS.map((target) => (
          <BarButton
            key={target}
            label={targetLabel(target, trackName, t)}
            palette={palette}
            isActive={draft.target === target}
            isEnabled={target !== 'selection' || selection !== undefined}
            onPress={() => change({ target })}
          />
        ))}
        <View style={styles.spaced} />
        <BarButton label={t('window.transpose.chordsOnly')} palette={palette} isActive={draft.isChordsOnly} onPress={() => change({ isChordsOnly: !draft.isChordsOnly })} />
      </View>
      <View style={styles.row}>
        <BarButton label={t('window.transpose.title')} palette={palette} isAccent onPress={() => onTranspose(draft)} />
        <BarButton label={t('common.close')} palette={palette} onPress={onClose} />
        <Text style={[styles.hint, { color: palette.muted }]}>
          {`${how.charAt(0).toUpperCase()}${how.slice(1)}${draft.isChordsOnly ? t('window.transpose.chordsOnlySuffix') : ''}${draft.target === 'selection' && selection !== undefined ? ` · ${selection}` : ''}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  label: { fontSize: 12, fontWeight: '600', marginRight: 8 },
  spaced: { marginLeft: 12 },
  hint: { fontSize: 11, marginLeft: 4, marginRight: 8 },
  field: { width: 44, fontSize: 12, textAlign: 'center', paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, marginRight: 4 },
  value: { minWidth: 24, fontSize: 12, fontWeight: '600', textAlign: 'center', marginRight: 4 },
});
