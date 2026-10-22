import { memo } from 'react';
import { type GestureResponderEvent, Pressable } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import type { MeasureLayout, RowLayout } from '../lib/layout';
import { ScoreCanvas } from '../native/score-canvas';
import type { RowGeometry, ScoreMode } from '../score/geometry';
import { scaleCommands } from '../score/draw';
import { type RowHit, hitTestRow } from '../score/hit-test';
import { type PlayingBeat, engraveRow, placeRow } from '../score/row';
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
  readonly markLanes?: readonly TabMarkKind[];
  /** Screen points per layout point (the score zoom); `width` and the geometry are in layout points. */
  readonly zoom: number;
  readonly onPress: (hit: RowHit) => void;
}

function ScoreRowView(props: ScoreRowProps) {
  const { row, headerWidth, geometry, width, zoom, onPress } = props;
  // The row only re-renders when isSameRow says its content changed, so engrave directly.
  const engraved = engraveRow(props);
  const commands = zoom === 1 ? engraved : scaleCommands(engraved, zoom);
  const stringCount = props.song.tracks[props.trackIndex]?.strings.length ?? 6;
  const handlePress = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    const hit = hitTestRow(placeRow(row, headerWidth), geometry, stringCount, locationX / zoom, locationY / zoom);
    if (hit !== undefined) {
      onPress(hit);
    }
  };
  return (
    <Pressable onPress={handlePress} style={{ width: width * zoom, height: geometry.height * zoom }}>
      <ScoreCanvas commands={commands} style={{ width: width * zoom, height: geometry.height * zoom }} />
    </Pressable>
  );
}

/**
 * A row re-renders only when something it draws changed: its measures or headers (edits keep untouched measures
 * identical), the measures on either side (ties, slurs, slides, spans across bar lines; key changes), the cursor or
 * playing beat inside it, mode, size, mark lanes or theme.
 */
export function isSameRow(a: ScoreRowProps, b: ScoreRowProps): boolean {
  if (
    a.mode !== b.mode || a.palette !== b.palette || a.width !== b.width || a.zoom !== b.zoom || a.headerWidth !== b.headerWidth ||
    a.geometry !== b.geometry || a.trackIndex !== b.trackIndex || a.onPress !== b.onPress || !sameLanes(a.markLanes, b.markLanes) ||
    !sameAddress(a.cursor, b.cursor) || a.playing?.measureIndex !== b.playing?.measureIndex || a.playing?.beatIndex !== b.playing?.beatIndex
  ) {
    return false;
  }
  const trackA = a.song.tracks[a.trackIndex];
  const trackB = b.song.tracks[b.trackIndex];
  if (trackA === undefined || trackB === undefined || trackA.strings !== trackB.strings || trackA.offset !== trackB.offset) {
    return trackA === trackB;
  }
  return a.row.measures.length === b.row.measures.length && a.row.measures.every((layout, i) => {
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
    a.showTimeSignature === b.showTimeSignature && a.showTempo === b.showTempo &&
    a.keySignatureX === b.keySignatureX && a.timeSignatureX === b.timeSignatureX
  );
}

/** Lanes are rebuilt from the whole track on every edit; only their kinds matter. */
function sameLanes(a: readonly TabMarkKind[] = [], b: readonly TabMarkKind[] = []): boolean {
  return a.length === b.length && a.every((kind, i) => kind === b[i]);
}

function sameAddress(a: StringAddress | undefined, b: StringAddress | undefined): boolean {
  return a?.measureIndex === b?.measureIndex && a?.beatIndex === b?.beatIndex && a?.string === b?.string && a?.voiceIndex === b?.voiceIndex;
}

export const ScoreRow = memo(ScoreRowView, isSameRow);
