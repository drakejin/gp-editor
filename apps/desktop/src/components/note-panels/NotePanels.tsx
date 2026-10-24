import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Bend, type BendShape, type Note, TREMOLO_BAR_PRESETS, type TremoloBarPresetName, type VibratoKind, bendShapeOf, buildBend, vibratoOf } from '@gp-editor/core';
import { type CurveDraft, draftCurve, isDraftOf } from '../../lib/curve-draft';
import type { NotePanel } from '../../lib/key-commands';
import { ScoreCanvas } from '../../native/score-canvas';
import { VIBRATO_PREVIEW, bendAmountLabel, engraveVibratoPreview } from '../../score/bend-graph';
import type { NoteEdit } from '../../state/note-edits';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { CurveNotePanel } from './CurveNotePanel';
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

/** Guitar Pro's tremolo bar presets (TuxGuitar's, a tone deep), in the order its editor lists them. */
const TREMOLO_BAR_CHOICES: readonly { readonly value: TremoloBarPresetName | 'none'; readonly label: string; readonly tooltip: string }[] = [
  { value: 'none', label: 'None', tooltip: 'No whammy bar: clears the grid' },
  { value: 'dip', label: 'Dip', tooltip: 'Down a tone and back' },
  { value: 'dive', label: 'Dive', tooltip: 'Down a tone and hold' },
  { value: 'releaseUp', label: 'Release (up)', tooltip: 'Starts a tone down, comes back up' },
  { value: 'invertedDip', label: 'Inverted dip', tooltip: 'Up a tone and back' },
  { value: 'return', label: 'Return', tooltip: 'Up a tone and hold' },
  { value: 'releaseDown', label: 'Release (down)', tooltip: 'Starts a tone up, comes back down' },
];

interface NotePanelViewProps {
  readonly palette: Palette;
  readonly panel: NotePanel;
  /** The note at the cursor. */
  readonly note: Note;
  readonly onEdit: (edit: SongEdit) => void;
  /** The bend or tremolo bar draft for the score to show (undefined: the note as it is). */
  readonly onPreview?: (edit: NoteEdit | undefined) => void;
  readonly onClose: () => void;
}

/**
 * B: how wide the note's vibrato is (changes apply at once). C and the palette's W.bar: the curve of its bend
 * ("choking") or tremolo bar, edited point by point and put on the note by Apply.
 */
export function NotePanelView({ palette, panel, note, onEdit, onPreview, onClose }: NotePanelViewProps) {
  if (panel === 'vibrato') {
    return (
      <NotePanelFrame palette={palette} title="Vibrato" subtitle={`String ${note.string} · fret ${note.fret}`} onClose={onClose}>
        <ChoiceRow palette={palette} label="WIDTH" choices={VIBRATOS} current={vibratoOf(note.effect)} onChoose={(vibrato) => onEdit({ type: 'setVibrato', vibrato })} />
        <View style={styles.preview}>
          <ScoreCanvas commands={engraveVibratoPreview(vibratoOf(note.effect), palette)} style={{ width: VIBRATO_PREVIEW.width, height: VIBRATO_PREVIEW.height }} />
        </View>
      </NotePanelFrame>
    );
  }
  const renderPresets =
    panel === 'bend'
      ? (draft: CurveDraft, onLoad: (curve: Bend | undefined) => void) => <BendPresets palette={palette} draft={draft} onLoad={onLoad} />
      : (draft: CurveDraft, onLoad: (curve: Bend | undefined) => void) => <TremoloBarPresets palette={palette} draft={draft} onLoad={onLoad} />;
  return <CurveNotePanel palette={palette} effect={panel} note={note} renderPresets={renderPresets} onEdit={onEdit} onPreview={onPreview} onClose={onClose} />;
}

interface PresetsProps {
  readonly palette: Palette;
  readonly draft: CurveDraft;
  readonly onLoad: (curve: Bend | undefined) => void;
}

/** The bend's shape and amount, as before the grid: each loads that bend into the grid. */
function BendPresets({ palette, draft, onLoad }: PresetsProps) {
  const curve = draftCurve(draft);
  const shaped = curve === undefined ? undefined : bendShapeOf(curve);
  const [amount, setAmount] = useState(shaped?.amount ?? DEFAULT_BEND_AMOUNT);
  const shape: BendShape | 'none' | undefined = curve === undefined ? 'none' : shaped?.shape;
  const chooseAmount = (next: number) => {
    setAmount(next);
    onLoad(buildBend(shape === undefined || shape === 'none' ? 'bend' : shape, next));
  };
  return (
    <>
      <ChoiceRow palette={palette} label="SHAPE" choices={BEND_SHAPES} current={shape} onChoose={(next) => onLoad(next === 'none' ? undefined : buildBend(next, amount))} />
      <ChoiceRow
        palette={palette}
        label="AMOUNT"
        choices={BEND_AMOUNTS.map((value) => ({ value, label: bendAmountLabel(value), tooltip: `${bendAmountLabel(value)} tone` }))}
        current={curve === undefined ? amount : shaped?.amount}
        onChoose={chooseAmount}
      />
    </>
  );
}

/** Guitar Pro's tremolo bar presets: each loads its curve into the grid. */
function TremoloBarPresets({ palette, draft, onLoad }: PresetsProps) {
  const current = TREMOLO_BAR_CHOICES.find(({ value }) => (value === 'none' ? draft.points.length === 0 : isDraftOf(draft, TREMOLO_BAR_PRESETS[value])))?.value;
  return (
    <ChoiceRow palette={palette} label="PRESET" choices={TREMOLO_BAR_CHOICES} current={current} onChoose={(value) => onLoad(value === 'none' ? undefined : TREMOLO_BAR_PRESETS[value])} />
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', paddingTop: 4 },
});
