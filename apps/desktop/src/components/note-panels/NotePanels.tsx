import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { type Bend, type BendShape, type Note, TREMOLO_BAR_PRESETS, type TremoloBarPresetName, type VibratoKind, bendShapeOf, buildBend, vibratoOf } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { type CurveDraft, draftCurve, isDraftOf } from '../../lib/curve-draft';
import type { MessageKey } from '../../lib/i18n/i18n';
import type { NotePanel } from '../../lib/key-commands';
import { ScoreCanvas } from '../../native/score-canvas';
import { VIBRATO_PREVIEW, bendAmountLabel, engraveVibratoPreview } from '../../score/bend-graph';
import type { NoteEdit } from '../../state/note-edits';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { CurveNotePanel } from './CurveNotePanel';
import { ChoiceRow, NotePanelFrame } from './NotePanelFrame';

/** A choice of a note panel with its label's and tooltip's message keys. */
interface ChoiceKeys<T> {
  readonly value: T;
  readonly label: MessageKey;
  readonly tooltip: MessageKey;
}

const VIBRATOS: readonly ChoiceKeys<VibratoKind>[] = [
  { value: 'none', label: 'common.none', tooltip: 'tools.notePanels.vibrato.noneTooltip' },
  { value: 'slight', label: 'tools.notePanels.vibrato.slight', tooltip: 'tools.notePanels.vibrato.slightTooltip' },
  { value: 'wide', label: 'tools.notePanels.vibrato.wide', tooltip: 'tools.notePanels.vibrato.wideTooltip' },
];

const BEND_SHAPES: readonly ChoiceKeys<BendShape | 'none'>[] = [
  { value: 'none', label: 'common.none', tooltip: 'tools.notePanels.bend.noneTooltip' },
  { value: 'bend', label: 'tools.notePanels.bend.bend', tooltip: 'tools.notePanels.bend.bendTooltip' },
  { value: 'bendRelease', label: 'tools.notePanels.bend.bendRelease', tooltip: 'tools.notePanels.bend.bendReleaseTooltip' },
  { value: 'bendReleaseBend', label: 'tools.notePanels.bend.bendReleaseBend', tooltip: 'tools.notePanels.bend.bendReleaseBendTooltip' },
  { value: 'preBend', label: 'tools.notePanels.bend.preBend', tooltip: 'tools.notePanels.bend.preBendTooltip' },
  { value: 'preBendRelease', label: 'tools.notePanels.bend.preBendRelease', tooltip: 'tools.notePanels.bend.preBendReleaseTooltip' },
  { value: 'release', label: 'tools.notePanels.bend.release', tooltip: 'tools.notePanels.bend.releaseTooltip' },
];

/** Bend amounts offered, in quarter tones: ¼ to 3 tones. */
const BEND_AMOUNTS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12];
/** A new bend's amount when the note has none yet: a whole tone ("full"). */
const DEFAULT_BEND_AMOUNT = 4;

/** Guitar Pro's tremolo bar presets (TuxGuitar's, a tone deep), in the order its editor lists them. */
const TREMOLO_BAR_CHOICES: readonly ChoiceKeys<TremoloBarPresetName | 'none'>[] = [
  { value: 'none', label: 'common.none', tooltip: 'tools.notePanels.whammy.noneTooltip' },
  { value: 'dip', label: 'tools.notePanels.whammy.dip', tooltip: 'tools.notePanels.whammy.dipTooltip' },
  { value: 'dive', label: 'tools.notePanels.whammy.dive', tooltip: 'tools.notePanels.whammy.diveTooltip' },
  { value: 'releaseUp', label: 'tools.notePanels.whammy.releaseUp', tooltip: 'tools.notePanels.whammy.releaseUpTooltip' },
  { value: 'invertedDip', label: 'tools.notePanels.whammy.invertedDip', tooltip: 'tools.notePanels.whammy.invertedDipTooltip' },
  { value: 'return', label: 'tools.notePanels.whammy.return', tooltip: 'tools.notePanels.whammy.returnTooltip' },
  { value: 'releaseDown', label: 'tools.notePanels.whammy.releaseDown', tooltip: 'tools.notePanels.whammy.releaseDownTooltip' },
];

/** The choices' labels and tooltips in the shown language. */
function translateChoices<T>(choices: readonly ChoiceKeys<T>[], t: (key: MessageKey) => string): readonly { readonly value: T; readonly label: string; readonly tooltip: string }[] {
  return choices.map(({ value, label, tooltip }) => ({ value, label: t(label), tooltip: t(tooltip) }));
}

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
  const t = useT();
  if (panel === 'vibrato') {
    return (
      <NotePanelFrame palette={palette} title={t('tools.notePanels.vibrato')} subtitle={t('tools.notePanels.noteAt', { string: note.string, fret: note.fret })} onClose={onClose}>
        <ChoiceRow palette={palette} label={t('tools.notePanels.width')} choices={translateChoices(VIBRATOS, t)} current={vibratoOf(note.effect)} onChoose={(vibrato) => onEdit({ type: 'setVibrato', vibrato })} />
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
  const t = useT();
  const shape: BendShape | 'none' | undefined = curve === undefined ? 'none' : shaped?.shape;
  const chooseAmount = (next: number) => {
    setAmount(next);
    onLoad(buildBend(shape === undefined || shape === 'none' ? 'bend' : shape, next));
  };
  return (
    <>
      <ChoiceRow palette={palette} label={t('tools.notePanels.shape')} choices={translateChoices(BEND_SHAPES, t)} current={shape} onChoose={(next) => onLoad(next === 'none' ? undefined : buildBend(next, amount))} />
      <ChoiceRow
        palette={palette}
        label={t('tools.notePanels.amount')}
        choices={BEND_AMOUNTS.map((value) => ({ value, label: bendAmountLabel(value), tooltip: t('tools.notePanels.amountTooltip', { amount: bendAmountLabel(value) }) }))}
        current={curve === undefined ? amount : shaped?.amount}
        onChoose={chooseAmount}
      />
    </>
  );
}

/** Guitar Pro's tremolo bar presets: each loads its curve into the grid. */
function TremoloBarPresets({ palette, draft, onLoad }: PresetsProps) {
  const t = useT();
  const current = TREMOLO_BAR_CHOICES.find(({ value }) => (value === 'none' ? draft.points.length === 0 : isDraftOf(draft, TREMOLO_BAR_PRESETS[value])))?.value;
  return (
    <ChoiceRow palette={palette} label={t('tools.notePanels.preset')} choices={translateChoices(TREMOLO_BAR_CHOICES, t)} current={current} onChoose={(value) => onLoad(value === 'none' ? undefined : TREMOLO_BAR_PRESETS[value])} />
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', paddingTop: 4 },
});
