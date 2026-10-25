import { DRUM_KEY_STAFF, type DrumKeyStaffBox, drumKeyStaffBox } from '../score/drum-key-staff';
import { type DrumKeyGroup, drumGroupName, drumKeyRowWidth, drumKeyRows, labelWidth } from './drum-key';

/** The Drum Key's columns: their names' size and the room beside them, and the gap between two columns. */
export const DRUM_KEY_LAYOUT = { nameSize: 13, namePadding: 10, gap: 18 } as const;

export interface DrumKeyColumnLayout {
  readonly group: DrumKeyGroup;
  /** Its drums share it. */
  readonly width: number;
}

/** A row of columns: one staff height for all of them, so their staves line up. */
export interface DrumKeyRowLayout {
  readonly columns: readonly DrumKeyColumnLayout[];
  readonly box: DrumKeyStaffBox;
  readonly width: number;
}

/** A column's width: its drums' columns, or its name's when that is wider (a one-drum "Tambourine"). */
export function drumKeyColumnWidth(group: DrumKeyGroup): number {
  return Math.max(group.entries.length * DRUM_KEY_STAFF.column, labelWidth(drumGroupName(group.id), DRUM_KEY_LAYOUT.nameSize) + DRUM_KEY_LAYOUT.namePadding);
}

/** The columns in rows up to `maxWidth` wide, each row's staves as tall as its own drums need. */
export function layoutDrumKey(groups: readonly DrumKeyGroup[], maxWidth: number): readonly DrumKeyRowLayout[] {
  const spec = { maxWidth, gap: DRUM_KEY_LAYOUT.gap, widthOf: drumKeyColumnWidth };
  return drumKeyRows(groups, spec).map((row) => ({
    columns: row.map((group) => ({ group, width: drumKeyColumnWidth(group) })),
    box: drumKeyStaffBox(row.flatMap((group) => group.entries.map((entry) => entry.key))),
    width: drumKeyRowWidth(row, spec),
  }));
}
