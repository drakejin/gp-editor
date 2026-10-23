import { type Bend, TREMOLO_BAR_PRESETS, buildBend } from '@gp-editor/core';
import {
  curveValueLabel,
  describeDraftPoint,
  dragDraft,
  draftCurve,
  draftFromCurve,
  isDraftOf,
  loadDraftCurve,
  pressDraft,
  removeDraftPoint,
  stepDraftPoint,
} from '../src/lib/curve-draft';

const DIP = TREMOLO_BAR_PRESETS.dip;

function pairs(curve: Bend | undefined): (readonly [number, number])[] {
  return (curve?.points ?? []).map((point) => [point.position, point.value] as const);
}

describe('draftFromCurve', () => {
  it('starts from the note’s curve, one point per position, nothing selected', () => {
    // Act
    const draft = draftFromCurve('tremoloBar', { points: [{ position: 0, value: 0 }, { position: 0, value: 0 }, { position: 6, value: -4 }, { position: 12, value: 0 }] });

    // Assert
    expect(pairs(draftCurve(draft))).toEqual([[0, 0], [6, -4], [12, 0]]);
    expect(draft.selectedIndex).toBeUndefined();
  });

  it('starts empty for a note without the effect', () => {
    expect(draftCurve(draftFromCurve('bend', undefined))).toBeUndefined();
  });
});

describe('pressDraft', () => {
  it('selects the point that was hit', () => {
    expect(pressDraft(draftFromCurve('tremoloBar', DIP), 1, { position: 6.3, value: -4.2 }).selectedIndex).toBe(1);
  });

  it('adds a point on the grid where nothing was hit, and selects it', () => {
    // Act
    const pressed = pressDraft(draftFromCurve('tremoloBar', DIP), undefined, { position: 2.8, value: -6.4 });

    // Assert
    expect(pairs(draftCurve(pressed))).toEqual([[0, 0], [3, -6], [6, -4], [12, 0]]);
    expect(pressed.selectedIndex).toBe(1);
  });

  it('keeps a bend’s new point at or above the note', () => {
    expect(pairs(draftCurve(pressDraft(draftFromCurve('bend', undefined), undefined, { position: 4, value: -3 })))).toEqual([[4, 0]]);
  });
});

describe('dragDraft', () => {
  it('moves the selected point with the pointer, from where the drag started', () => {
    // Arrange
    const start = pressDraft(draftFromCurve('tremoloBar', DIP), 1, { position: 6, value: -4 });

    // Act
    const dragged = dragDraft(start, { position: 4.4, value: 2.6 });

    // Assert
    expect(pairs(draftCurve(dragged))).toEqual([[0, 0], [4, 3], [12, 0]]);
    expect(dragged.selectedIndex).toBe(1);
    expect(pairs(draftCurve(start))).toEqual([[0, 0], [6, -4], [12, 0]]);
  });

  it('gives the same draft when nothing is selected or the point stays', () => {
    const unselected = draftFromCurve('tremoloBar', DIP);
    const selected = pressDraft(unselected, 1, { position: 6, value: -4 });
    expect(dragDraft(unselected, { position: 3, value: 3 })).toBe(unselected);
    expect(dragDraft(selected, { position: 6.2, value: -3.9 })).toBe(selected);
  });
});

describe('removeDraftPoint and stepDraftPoint', () => {
  it('removes the selected point, or the one given, and leaves nothing selected', () => {
    // Arrange
    const selected = pressDraft(draftFromCurve('tremoloBar', DIP), 1, { position: 6, value: -4 });

    // Act
    const removed = removeDraftPoint(selected);
    const removedFirst = removeDraftPoint(selected, 0);

    // Assert
    expect(pairs(draftCurve(removed))).toEqual([[0, 0], [12, 0]]);
    expect(removed.selectedIndex).toBeUndefined();
    expect(pairs(draftCurve(removedFirst))).toEqual([[6, -4], [12, 0]]);
    expect(removeDraftPoint(draftFromCurve('tremoloBar', DIP))).toEqual(draftFromCurve('tremoloBar', DIP));
  });

  it('steps the selected point by quarter tones and positions, within its neighbours and the range', () => {
    // Arrange
    const selected = pressDraft(draftFromCurve('bend', buildBend('bend', 4)), 1, { position: 6, value: 4 });

    // Act
    const raised = stepDraftPoint(selected, 0, 1);
    const later = stepDraftPoint(raised, 1, 0);
    const pastTheTop = stepDraftPoint(selected, 0, 20);

    // Assert
    expect(pairs(draftCurve(raised))).toEqual([[0, 0], [6, 5], [12, 4]]);
    expect(pairs(draftCurve(later))).toEqual([[0, 0], [7, 5], [12, 4]]);
    expect(pairs(draftCurve(pastTheTop))).toEqual([[0, 0], [6, 12], [12, 4]]);
    expect(stepDraftPoint(draftFromCurve('bend', buildBend('bend', 4)), 0, 1).points).toEqual(buildBend('bend', 4).points);
  });
});

describe('loadDraftCurve and isDraftOf', () => {
  it('loads a preset in place of the points and clears the selection', () => {
    // Arrange
    const selected = pressDraft(draftFromCurve('tremoloBar', DIP), 1, { position: 6, value: -4 });

    // Act
    const loaded = loadDraftCurve(selected, TREMOLO_BAR_PRESETS.dive);

    // Assert
    expect(draftCurve(loaded)).toEqual(TREMOLO_BAR_PRESETS.dive);
    expect(loaded.selectedIndex).toBeUndefined();
    expect(draftCurve(loadDraftCurve(selected, undefined))).toBeUndefined();
  });

  it('tells whether Apply would leave the note as it is', () => {
    const draft = draftFromCurve('tremoloBar', DIP);
    expect(isDraftOf(draft, DIP)).toBe(true);
    expect(isDraftOf(draft, { points: [{ position: 0, value: 0 }, { position: 0, value: 0 }, ...DIP.points.slice(1)] })).toBe(true);
    expect(isDraftOf(draft, undefined)).toBe(false);
    expect(isDraftOf(draftFromCurve('tremoloBar', undefined), undefined)).toBe(true);
    expect(isDraftOf(stepDraftPoint(pressDraft(draft, 1, DIP.points[1] ?? { position: 6, value: -4 }), 0, -1), DIP)).toBe(false);
  });
});

describe('curveValueLabel and describeDraftPoint', () => {
  it('writes a tremolo bar value in tones with its sign, and a bend as Guitar Pro names it', () => {
    expect([-6, -4, -1, 0, 1, 2, 9].map((value) => curveValueLabel('tremoloBar', value))).toEqual(['−1½', '−1', '−¼', '0', '+¼', '+½', '+2¼']);
    expect([0, 2, 4, 6].map((value) => curveValueLabel('bend', value))).toEqual(['0', '½', 'full', '1½']);
  });

  it('describes the selected point, or how to edit when none is', () => {
    const draft = draftFromCurve('tremoloBar', DIP);
    expect(describeDraftPoint(pressDraft(draft, 1, { position: 6, value: -4 }))).toBe('Point 2 of 3: 6/12 of the note, −1 tone');
    expect(describeDraftPoint(pressDraft(draft, 0, { position: 0, value: 0 }))).toBe('Point 1 of 3: 0/12 of the note, at pitch');
    expect(describeDraftPoint(draft)).toBe('Click the grid to add a point; drag a point to move it; right-click or ⌃-click removes it.');
  });
});
