import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Bend, type CurveEffect, type Note, canGpifHoldCurve } from '@gp-editor/core';
import {
  type CurveDraft,
  describeDraftPoint,
  draftCurve,
  draftFromCurve,
  isDraftOf,
  isSameDraft,
  loadDraftCurve,
  removeDraftPoint,
  stepDraftPoint,
} from '../../lib/curve-draft';
import type { NoteEdit } from '../../state/note-edits';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { CurveEditor } from './CurveEditor';
import { NotePanelFrame } from './NotePanelFrame';

export interface CurveNotePanelProps {
  readonly palette: Palette;
  readonly effect: CurveEffect;
  /** The note at the cursor. */
  readonly note: Note;
  /** The rows of presets over the grid; `onLoad` puts a curve (undefined: none) in the draft. */
  readonly renderPresets: (draft: CurveDraft, onLoad: (curve: Bend | undefined) => void) => ReactNode;
  /** Apply and Remove: one edit, one undo step. */
  readonly onEdit: (edit: NoteEdit) => void;
  /** The draft as an edit for the score to show while it differs from the note; undefined when there is none to show. */
  readonly onPreview?: (edit: NoteEdit | undefined) => void;
  readonly onClose: () => void;
}

const TITLES: Readonly<Record<CurveEffect, string>> = { bend: 'Bend (choking)', tremoloBar: 'Tremolo bar (whammy bar)' };
const NOUNS: Readonly<Record<CurveEffect, string>> = { bend: 'bend', tremoloBar: 'whammy bar' };
/** The readout and the .gp note take two lines of 11-point text whatever they say. */
const LINE_HEIGHT = 15;
const TWO_LINES = LINE_HEIGHT * 2;
const GPIF_HINT = 'A .gp file (Guitar Pro 7/8) keeps a simpler curve: a start, one middle value and an end. A .gp5 file keeps every point.';

/** The note edit that puts `curve` (undefined: none) on the note as its bend or tremolo bar. */
export function curveEdit(effect: CurveEffect, curve: Bend | undefined): NoteEdit {
  return effect === 'bend' ? { type: 'setBend', bend: curve } : { type: 'setTremoloBar', tremoloBar: curve };
}

/**
 * Guitar Pro 8's bend and tremolo bar editors for the note at the cursor: presets, the curve on a grid to change point
 * by point, the selected point stepped with buttons. The score previews the draft; Apply puts it on the note (one undo
 * step), Done leaves the note as it was.
 */
export function CurveNotePanel({ palette, effect, note, renderPresets, onEdit, onPreview, onClose }: CurveNotePanelProps) {
  const original = note.effect[effect];
  const [draft, setDraft] = useState(() => draftFromCurve(effect, original));
  const change = useCallback((next: CurveDraft) => setDraft((current) => (isSameDraft(current, next) ? current : next)), []);
  const curve = draftCurve(draft);
  const isChanged = !isDraftOf(draft, original);
  useEffect(() => {
    onPreview?.(isChanged ? curveEdit(effect, draftCurve(draft)) : undefined);
  }, [draft, isChanged, effect, onPreview]);
  useEffect(() => () => onPreview?.(undefined), [onPreview]);
  const apply = (next: Bend | undefined) => {
    onEdit(curveEdit(effect, next));
    onClose();
  };
  return (
    <NotePanelFrame palette={palette} title={TITLES[effect]} subtitle={`String ${note.string} · fret ${note.fret}`} closeTooltip="Close without changing the note" onClose={onClose}>
      {renderPresets(draft, (preset) => change(loadDraftCurve(draft, preset)))}
      <CurveEditor palette={palette} draft={draft} onChange={change} />
      <PointControls palette={palette} draft={draft} onChange={change} />
      {/* Always there, two lines high: the panel keeps its size, so the grid stays under the pointer while a drag changes the curve. */}
      <Text testID="curve-gpif-hint" numberOfLines={2} style={[styles.hint, { color: palette.chromeMuted }]}>
        {curve !== undefined && !canGpifHoldCurve(effect, curve) ? GPIF_HINT : ''}
      </Text>
      <View style={styles.footer}>
        <ChromeButton testID="curve-remove" palette={palette} label="Remove" tooltip={`Take the ${NOUNS[effect]} off the note`} isEnabled={original !== undefined} onPress={() => apply(undefined)} />
        <ChromeButton testID="curve-apply" palette={palette} label="Apply" tooltip={`Put this ${NOUNS[effect]} on the note`} isActive isEnabled={isChanged} onPress={() => apply(curve)} />
      </View>
    </NotePanelFrame>
  );
}

interface PointControlsProps {
  readonly palette: Palette;
  readonly draft: CurveDraft;
  readonly onChange: (draft: CurveDraft) => void;
}

/** The selected point (or how to edit), moved a position or a quarter tone at a time, or removed. */
function PointControls({ palette, draft, onChange }: PointControlsProps) {
  const isSelected = draft.selectedIndex !== undefined;
  const step = (positionStep: number, valueStep: number) => onChange(stepDraftPoint(draft, positionStep, valueStep));
  return (
    <View style={styles.points}>
      <Text testID="curve-readout" numberOfLines={2} style={[styles.readout, { color: palette.chromeText }]}>
        {describeDraftPoint(draft)}
      </Text>
      <ChromeButton palette={palette} label="◀" tooltip="Move the point earlier" isEnabled={isSelected} onPress={() => step(-1, 0)} />
      <ChromeButton palette={palette} label="▶" tooltip="Move the point later" isEnabled={isSelected} onPress={() => step(1, 0)} />
      <ChromeButton palette={palette} label="▼" tooltip="A quarter tone lower" isEnabled={isSelected} onPress={() => step(0, -1)} />
      <ChromeButton palette={palette} label="▲" tooltip="A quarter tone higher" isEnabled={isSelected} onPress={() => step(0, 1)} />
      <ChromeButton testID="curve-delete-point" palette={palette} label="Delete" tooltip="Remove the selected point" isEnabled={isSelected} onPress={() => onChange(removeDraftPoint(draft))} />
    </View>
  );
}

const styles = StyleSheet.create({
  points: { flexDirection: 'row', alignItems: 'center', columnGap: 2, height: TWO_LINES },
  readout: { flex: 1, fontSize: 11 },
  hint: { fontSize: 11, lineHeight: LINE_HEIGHT, height: TWO_LINES },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', columnGap: 6 },
});
