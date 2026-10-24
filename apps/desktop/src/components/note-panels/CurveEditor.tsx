import { useMemo, useRef } from 'react';
import { type GestureResponderEvent, type NativeMouseEvent, type NativeSyntheticEvent, Pressable } from 'react-native';
import type { CurveValueRange } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { type CurveDraft, dragDraft, pressDraft, removeDraftPoint } from '../../lib/curve-draft';
import { ScoreCanvas } from '../../native/score-canvas';
import { CURVE_GRID, curvePointAt, curvePointXY, curveView, engraveCurveGrid, hitTestCurvePoint } from '../../score/curve-grid';
import type { Palette } from '../../theme';

interface CurveEditorProps {
  readonly palette: Palette;
  readonly draft: CurveDraft;
  readonly onChange: (draft: CurveDraft) => void;
}

/** A drag keeps going wherever the pointer goes, even far outside the grid. */
const DRAG_RETENTION = { top: 10000, bottom: 10000, left: 10000, right: 10000 };
const SIZE = { width: CURVE_GRID.width, height: CURVE_GRID.height };

/** Where a drag began: the draft with its point selected, the grid's scale then, and the point's offset from the pointer. */
interface DragStart {
  readonly draft: CurveDraft;
  readonly view: CurveValueRange;
  readonly offset: { readonly x: number; readonly y: number };
}

/**
 * The bend and tremolo bar panels' grid (Guitar Pro 8's curve editor): a click on the grid adds a point there, on a
 * point selects it; a drag moves the point; a right click or ⌃-click removes the point under the pointer. Drags arrive
 * as onPressMove.
 */
export function CurveEditor({ palette, draft, onChange }: CurveEditorProps) {
  const t = useT();
  const view = curveView(draft);
  const { min, max } = view;
  const commands = useMemo(() => engraveCurveGrid(draft, { min, max }, palette), [draft, min, max, palette]);
  const drag = useRef<DragStart | undefined>(undefined);
  const removeAt = (x: number, y: number) => {
    drag.current = undefined;
    const hit = hitTestCurvePoint(draft.points, x, y, view);
    if (hit !== undefined) {
      onChange(removeDraftPoint(draft, hit));
    }
  };
  const handlePressIn = (event: GestureResponderEvent) => {
    const { locationX, locationY, ctrlKey } = event.nativeEvent;
    if (ctrlKey === true) {
      removeAt(locationX, locationY);
      return;
    }
    const pressed = pressDraft(draft, hitTestCurvePoint(draft.points, locationX, locationY, view), curvePointAt(locationX, locationY, view));
    const point = pressed.selectedIndex === undefined ? undefined : pressed.points[pressed.selectedIndex];
    // The point keeps its offset from the pointer: a press beside a point does not move it before the mouse does.
    const at = point === undefined ? { x: locationX, y: locationY } : curvePointXY(point, view);
    drag.current = { draft: pressed, view, offset: { x: at.x - locationX, y: at.y - locationY } };
    onChange(pressed);
  };
  const handlePressMove = (event: GestureResponderEvent) => {
    const start = drag.current;
    if (start !== undefined) {
      // Fabric measures a touch's location from the view it started in, also once it has left that view.
      const { locationX, locationY } = event.nativeEvent;
      onChange(dragDraft(start.draft, curvePointAt(locationX + start.offset.x, locationY + start.offset.y, start.view)));
    }
  };
  const handleAuxClick = (event: NativeSyntheticEvent<NativeMouseEvent>) => removeAt(event.nativeEvent.clientX, event.nativeEvent.clientY);
  return (
    <Pressable
      testID="curve-grid"
      accessibilityLabel={t('tools.notePanels.curve')}
      onPressIn={handlePressIn}
      onPressMove={handlePressMove}
      onPressOut={() => {
        drag.current = undefined;
      }}
      onAuxClick={handleAuxClick}
      pressRetentionOffset={DRAG_RETENTION}
      style={SIZE}
    >
      <ScoreCanvas commands={commands} style={SIZE} />
    </Pressable>
  );
}
