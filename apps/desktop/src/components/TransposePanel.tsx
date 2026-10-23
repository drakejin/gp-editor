import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

function targetLabel(target: TranspositionTarget, trackName: string): string {
  switch (target) {
    case 'selection':
      return 'Selection';
    case 'track':
      return trackName === '' ? 'Track' : `Track “${trackName}”`;
    case 'song':
      return 'Whole song';
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
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]} accessibilityLabel="Transpose">
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>Transpose</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>Notes keep their string while the new fret is on the neck; drum tracks never move.</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>By</Text>
        <BarButton label="Semitones" palette={palette} isActive={isChromatic} onPress={() => change({ mode: 'chromatic' })} />
        <BarButton label="Scale steps" palette={palette} isActive={!isChromatic} onPress={() => change({ mode: 'diatonic' })} />
        <Stepper palette={palette} label="Amount" onStep={stepAmount}>
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
        <Stepper palette={palette} label="Octaves" onStep={(delta) => change({ octaves: clampTransposeOctaves(draft.octaves + delta) })}>
          <Text style={[styles.value, { color: palette.text }]}>{draft.octaves}</Text>
        </Stepper>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Apply to</Text>
        {TARGETS.map((target) => (
          <BarButton
            key={target}
            label={targetLabel(target, trackName)}
            palette={palette}
            isActive={draft.target === target}
            isEnabled={target !== 'selection' || selection !== undefined}
            onPress={() => change({ target })}
          />
        ))}
        <View style={styles.spaced} />
        <BarButton label="Chords only" palette={palette} isActive={draft.isChordsOnly} onPress={() => change({ isChordsOnly: !draft.isChordsOnly })} />
      </View>
      <View style={styles.row}>
        <BarButton label="Transpose" palette={palette} isAccent onPress={() => onTranspose(draft)} />
        <BarButton label="Close" palette={palette} onPress={onClose} />
        <Text style={[styles.hint, { color: palette.muted }]}>
          {`${how.charAt(0).toUpperCase()}${how.slice(1)}${draft.isChordsOnly ? ', chord names and diagrams only' : ''}${draft.target === 'selection' && selection !== undefined ? ` · ${selection}` : ''}`}
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
