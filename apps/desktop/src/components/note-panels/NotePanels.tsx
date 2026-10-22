import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { type BendShape, type Note, type VibratoKind, bendShapeOf, vibratoOf } from '@gp-editor/core';
import type { NotePanel } from '../../lib/key-commands';
import { ScoreCanvas } from '../../native/score-canvas';
import { BEND_GRAPH, VIBRATO_PREVIEW, bendAmountLabel, engraveBendGraph, engraveVibratoPreview } from '../../score/bend-graph';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { ChoiceRow, NotePanelFrame } from './NotePanelFrame';

const VIBRATOS: readonly { readonly value: VibratoKind; readonly label: string; readonly tooltip: string }[] = [
  { value: 'none', label: 'None', tooltip: 'No vibrato' },
  { value: 'slight', label: 'Slight', tooltip: 'Slight vibrato (~)' },
  { value: 'wide', label: 'Wide', tooltip: 'Wide vibrato (~~)' },
];

const BEND_SHAPES: readonly { readonly value: BendShape | 'none'; readonly label: string; readonly tooltip: string }[] = [
  { value: 'none', label: 'None', tooltip: 'No bend' },
  { value: 'bend', label: 'Bend', tooltip: 'Bend up and hold' },
  { value: 'bendRelease', label: 'Bend & release', tooltip: 'Bend up, then back' },
  { value: 'bendReleaseBend', label: 'Bend, release, bend', tooltip: 'Bend, release, bend again' },
  { value: 'preBend', label: 'Pre-bend', tooltip: 'Bent before it is struck' },
  { value: 'preBendRelease', label: 'Pre-bend & release', tooltip: 'Bent before it is struck, then released' },
  { value: 'release', label: 'Release', tooltip: 'Starts bent and releases' },
];

/** Bend amounts offered, in quarter tones: ¼ to 3 tones. */
const BEND_AMOUNTS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12];
/** A new bend's amount when the note has none yet: a whole tone ("full"). */
const DEFAULT_BEND_AMOUNT = 4;

interface NotePanelViewProps {
  readonly palette: Palette;
  readonly panel: NotePanel;
  /** The note at the cursor. */
  readonly note: Note;
  readonly onEdit: (edit: SongEdit) => void;
  readonly onClose: () => void;
}

/** B / C: how wide the note's vibrato is, or the shape and amount of its bend ("choking"); changes apply at once. */
export function NotePanelView({ palette, panel, note, onEdit, onClose }: NotePanelViewProps) {
  const subtitle = `String ${note.string} · fret ${note.fret}`;
  return panel === 'vibrato' ? (
    <NotePanelFrame palette={palette} title="Vibrato" subtitle={subtitle} onClose={onClose}>
      <ChoiceRow palette={palette} label="WIDTH" choices={VIBRATOS} current={vibratoOf(note.effect)} onChoose={(vibrato) => onEdit({ type: 'setVibrato', vibrato })} />
      <View style={styles.preview}>
        <ScoreCanvas commands={engraveVibratoPreview(vibratoOf(note.effect), palette)} style={{ width: VIBRATO_PREVIEW.width, height: VIBRATO_PREVIEW.height }} />
      </View>
    </NotePanelFrame>
  ) : (
    <NotePanelFrame palette={palette} title="Bend (choking)" subtitle={subtitle} onClose={onClose}>
      <BendControls palette={palette} note={note} onEdit={onEdit} />
    </NotePanelFrame>
  );
}

function BendControls({ palette, note, onEdit }: Pick<NotePanelViewProps, 'palette' | 'note' | 'onEdit'>) {
  const current = note.effect.bend === undefined ? undefined : bendShapeOf(note.effect.bend);
  const [amount, setAmount] = useState(current?.amount ?? DEFAULT_BEND_AMOUNT);
  const shape: BendShape | 'none' | undefined = note.effect.bend === undefined ? 'none' : current?.shape;
  const chooseAmount = (next: number) => {
    setAmount(next);
    onEdit({ type: 'setBendShape', shape: shape === undefined || shape === 'none' ? 'bend' : shape, amount: next });
  };
  return (
    <>
      <ChoiceRow palette={palette} label="SHAPE" choices={BEND_SHAPES} current={shape} onChoose={(next) => onEdit({ type: 'setBendShape', shape: next, amount })} />
      <ChoiceRow
        palette={palette}
        label="AMOUNT"
        choices={BEND_AMOUNTS.map((value) => ({ value, label: bendAmountLabel(value), tooltip: `${bendAmountLabel(value)} tone` }))}
        current={note.effect.bend === undefined ? amount : current?.amount}
        onChoose={chooseAmount}
      />
      <View style={styles.preview}>
        <ScoreCanvas commands={engraveBendGraph(note.effect.bend, Math.max(DEFAULT_BEND_AMOUNT, current?.amount ?? amount), palette)} style={{ width: BEND_GRAPH.width, height: BEND_GRAPH.height }} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', paddingTop: 4 },
});
