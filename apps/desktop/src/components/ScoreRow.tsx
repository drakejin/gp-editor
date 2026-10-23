import { memo, useRef } from 'react';
import { type GestureResponderEvent, Pressable } from 'react-native';
import type { Song, StringAddress, Track } from '@gp-editor/core';
import type { MeasureLayout, RowLayout } from '../lib/layout';
import { ScoreCanvas } from '../native/score-canvas';
import type { RowGeometry, ScoreMode } from '../score/geometry';
import { scaleCommands } from '../score/draw';
import { dynamicBefore } from '../score/dynamics';
import { type RowHit, hitTestRow } from '../score/hit-test';
import { type PlayingBeat, engraveRow, placeRow } from '../score/row';
import { type BeatRange, isSameRange } from '../score/selection-tint';
import type { TabMarkKind } from '../score/tab';
import type { Palette } from '../theme';

export interface ScoreRowProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly row: RowLayout;
  readonly width: number;
  readonly headerWidth: number;
  readonly mode: ScoreMode;
  readonly geometry: RowGeometry;
  readonly palette: Palette;
  /** Only set when the cursor is in this row. */
  readonly cursor?: StringAddress;
  /** Only set when the playing beat is in this row. */
  readonly playing?: PlayingBeat;
  /** The selected beats inside this row (clipRange), tinted. */
  readonly selection?: BeatRange;
  readonly markLanes?: readonly TabMarkKind[];
  /** Screen points per layout point (the score zoom); `width` and the geometry are in layout points. */
  readonly zoom: number;
  /** This row's place in the score, for drags that run into other rows. */
  readonly rowIndex: number;
  /** The mouse went down on a beat; `isExtending` when shift was held. */
  readonly onPress: (hit: RowHit, isExtending: boolean) => void;
  /** A drag that began in this row moved: the pointer in layout points from this row's top left (it may leave the row). */
  readonly onDrag: (rowIndex: number, x: number, y: number) => void;
}

/** A drag keeps going wherever the pointer goes, even far outside the row. */
const DRAG_RETENTION = { top: 10000, bottom: 10000, left: 10000, right: 10000 };

interface DragStart {
  readonly x: number;
  readonly y: number;
  readonly pageX: number;
  readonly pageY: number;
}

function ScoreRowView(props: ScoreRowProps) {
  const { row, headerWidth, geometry, width, zoom, rowIndex, onPress, onDrag } = props;
  const dragStart = useRef<DragStart | undefined>(undefined);
  // The row only re-renders when isSameRow says its content changed, so engrave directly.
  const engraved = engraveRow(props);
  const commands = zoom === 1 ? engraved : scaleCommands(engraved, zoom);
  const stringCount = props.song.tracks[props.trackIndex]?.strings.length ?? 6;
  const handlePressIn = (event: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY, shiftKey } = event.nativeEvent;
    dragStart.current = { x: locationX, y: locationY, pageX, pageY };
    const hit = hitTestRow(placeRow(row, headerWidth), geometry, stringCount, locationX / zoom, locationY / zoom);
    if (hit !== undefined) {
      onPress(hit, shiftKey === true);
    }
  };
  // Measured from where the mouse went down, in window points, so the pointer can be followed into other rows.
  const handlePressMove = (event: GestureResponderEvent) => {
    const start = dragStart.current;
    if (start !== undefined) {
      const { pageX, pageY } = event.nativeEvent;
      onDrag(rowIndex, (start.x + pageX - start.pageX) / zoom, (start.y + pageY - start.pageY) / zoom);
    }
  };
  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressMove={handlePressMove}
      onPressOut={() => {
        dragStart.current = undefined;
      }}
      pressRetentionOffset={DRAG_RETENTION}
      style={{ width: width * zoom, height: geometry.height * zoom }}
    >
      <ScoreCanvas commands={commands} style={{ width: width * zoom, height: geometry.height * zoom }} />
    </Pressable>
  );
}

/**
 * A row re-renders only when something it draws changed: its measures or headers (edits keep untouched measures
 * identical), the measures on either side (ties, slurs, slides, spans across bar lines; key changes), the cursor,
 * playing beat or selected beats inside it, mode, size, mark lanes or theme.
 */
export function isSameRow(a: ScoreRowProps, b: ScoreRowProps): boolean {
  if (
    a.mode !== b.mode || a.palette !== b.palette || a.width !== b.width || a.zoom !== b.zoom || a.headerWidth !== b.headerWidth ||
    a.geometry !== b.geometry || a.trackIndex !== b.trackIndex || a.onPress !== b.onPress || a.onDrag !== b.onDrag || a.rowIndex !== b.rowIndex ||
    !sameLanes(a.markLanes, b.markLanes) ||
    !sameAddress(a.cursor, b.cursor) || a.playing?.measureIndex !== b.playing?.measureIndex || a.playing?.beatIndex !== b.playing?.beatIndex ||
    !isSameRange(a.selection, b.selection)
  ) {
    return false;
  }
  const trackA = a.song.tracks[a.trackIndex];
  const trackB = b.song.tracks[b.trackIndex];
  if (trackA === undefined || trackB === undefined || trackA.strings !== trackB.strings || trackA.offset !== trackB.offset) {
    return trackA === trackB;
  }
  return a.row.measures.length === b.row.measures.length && sameDynamicBefore(a, trackA, trackB) && a.row.measures.every((layout, i) => {
    const other = b.row.measures[i];
    const index = layout.measureIndex;
    return (
      other !== undefined && sameLayout(layout, other) &&
      trackA.measures[index] === trackB.measures[index] && trackA.measures[index - 1] === trackB.measures[index - 1] &&
      trackA.measures[index + 1] === trackB.measures[index + 1] &&
      a.song.measureHeaders[index] === b.song.measureHeaders[index] && a.song.measureHeaders[index - 1] === b.song.measureHeaders[index - 1]
    );
  });
}

/** Layout fields that change what is drawn (signature slots come from the previous measure). */
function sameLayout(a: MeasureLayout, b: MeasureLayout): boolean {
  return (
    a.measureIndex === b.measureIndex && a.width === b.width && a.beats.length === b.beats.length &&
    a.showTimeSignature === b.showTimeSignature && a.showTempo === b.showTempo && a.showTripletFeel === b.showTripletFeel &&
    a.keySignatureX === b.keySignatureX && a.timeSignatureX === b.timeSignatureX
  );
}

/**
 * The dynamic in force where the row starts decides its first mark, and it can come from any bar before (one note
 * changed several empty bars back): compared only when the row draws dynamics.
 */
function sameDynamicBefore(props: ScoreRowProps, trackA: Track, trackB: Track): boolean {
  const first = props.row.measures[0]?.measureIndex ?? 0;
  return props.geometry.dynamicsY === undefined || dynamicBefore(trackA.measures, first) === dynamicBefore(trackB.measures, first);
}

/** Lanes are rebuilt from the whole track on every edit; only their kinds matter. */
function sameLanes(a: readonly TabMarkKind[] = [], b: readonly TabMarkKind[] = []): boolean {
  return a.length === b.length && a.every((kind, i) => kind === b[i]);
}

function sameAddress(a: StringAddress | undefined, b: StringAddress | undefined): boolean {
  return a?.measureIndex === b?.measureIndex && a?.beatIndex === b?.beatIndex && a?.string === b?.string && a?.voiceIndex === b?.voiceIndex;
}

export const ScoreRow = memo(ScoreRowView, isSameRow);
