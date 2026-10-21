import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Beat, MeasureHeader, NoteAddress, Track } from '@gp-editor/core';
import { type BeamLayout, beamGroupTicks, layoutBeams } from '../lib/beams';
import { type MeasureLayout, TAB, primaryVoice, staffHeight, stringY } from '../lib/layout';
import { beatMarks, fretLabel } from '../lib/notation';
import { MONO_FONT, type Palette } from '../theme';
import { BeamLines, RestMark, RhythmStem, STEM_GAP } from './Rhythm';

interface TabMeasureProps {
  readonly track: Track;
  readonly trackIndex: number;
  readonly header: MeasureHeader;
  readonly layout: MeasureLayout;
  readonly selection?: NoteAddress;
  readonly palette: Palette;
  readonly onSelectNote: (address: NoteAddress) => void;
}

const FRET_BOX = { width: 22, height: 14 } as const;
const MARKER_LEFT = 18;
/** Effect marks start a little left of the beat and read rightwards, like a span label. */
const MARK_INSET = 8;

function TabMeasureView(props: TabMeasureProps) {
  const { track, header, layout, palette } = props;
  const stringCount = track.strings.length;
  const measure = track.measures[layout.measureIndex];
  const beams = measureBeams(measure?.beats ?? [], header, layout);
  return (
    <View style={{ width: layout.width, height: staffHeight(stringCount) }}>
      <MeasureHeading header={header} layout={layout} palette={palette} />
      {track.strings.map((guitarString) => (
        <View
          key={guitarString.number}
          style={[styles.stringLine, { top: stringY(guitarString.number), backgroundColor: palette.line }]}
        />
      ))}
      <BarLines header={header} stringCount={stringCount} palette={palette} />
      {layout.showTimeSignature ? <TimeSignature header={header} stringCount={stringCount} palette={palette} /> : null}
      {layout.beats.map((beatLayout) => {
        const beat = measure?.beats[beatLayout.beatIndex];
        return beat === undefined ? null : (
          <BeatView
            key={beatLayout.beatIndex}
            {...props}
            beat={beat}
            previousBeat={previousBeat(track, layout.measureIndex, beatLayout.beatIndex)}
            beatIndex={beatLayout.beatIndex}
            x={beatLayout.x}
            isBeamed={beams.beamed.has(beatLayout.beatIndex)}
          />
        );
      })}
      <BeamLines beams={beams.beams} top={stringY(stringCount) + STEM_GAP} palette={palette} />
    </View>
  );
}

/** Beams for the rhythm voice of each beat, grouped by the bar's time signature. */
function measureBeams(beats: readonly Beat[], header: MeasureHeader, layout: MeasureLayout): BeamLayout {
  const rhythm = layout.beats.map((beatLayout) => {
    const beat = beats[beatLayout.beatIndex];
    const voice = beat === undefined ? undefined : primaryVoice(beat);
    return {
      x: beatLayout.x,
      start: beat?.start ?? 0,
      value: voice?.duration.value ?? 4,
      isRest: voice === undefined || voice.notes.length === 0,
    };
  });
  const { numerator, denominator } = header.timeSignature;
  return layoutBeams(rhythm, header.start, beamGroupTicks(numerator, denominator));
}

/** The beat before this one on the track, across the bar line. */
function previousBeat(track: Track, measureIndex: number, beatIndex: number): Beat | undefined {
  if (beatIndex > 0) {
    return track.measures[measureIndex]?.beats[beatIndex - 1];
  }
  const beats = track.measures[measureIndex - 1]?.beats ?? [];
  return beats[beats.length - 1];
}

function MeasureHeading({ header, layout, palette }: Pick<TabMeasureProps, 'header' | 'layout' | 'palette'>) {
  const marker = header.marker;
  const markerWidth = Math.max(0, layout.width - MARKER_LEFT - 4);
  const endings = endingNumbers(header.repeatAlternative);
  return (
    <>
      <Text style={[styles.measureNumber, { color: palette.muted }]}>{header.number}</Text>
      {marker !== undefined ? (
        <Text
          numberOfLines={1}
          style={[styles.marker, { width: markerWidth, color: `rgb(${marker.color.r},${marker.color.g},${marker.color.b})` }]}
        >
          {marker.title}
        </Text>
      ) : null}
      {layout.showTempo ? <Text style={[styles.tempo, { color: palette.text }]}>♩ = {header.tempo}</Text> : null}
      {endings.length > 0 ? (
        <Text style={[styles.ending, { color: palette.text, borderColor: palette.text }]}>{endings.join(', ')}.</Text>
      ) : null}
    </>
  );
}

function endingNumbers(mask: number): number[] {
  return Array.from({ length: 8 }, (_, bit) => bit).filter((bit) => (mask & (1 << bit)) !== 0).map((bit) => bit + 1);
}

function BarLines({ header, stringCount, palette }: { header: MeasureHeader; stringCount: number; palette: Palette }) {
  const top = stringY(1);
  const height = Math.max(1, (stringCount - 1) * TAB.stringGap);
  const dotTop = top + height / 2;
  return (
    <>
      <View style={[styles.barLine, { right: 0, top, height, backgroundColor: palette.text }]} />
      {header.repeatOpen ? (
        <>
          <View style={[styles.thickBar, { left: 0, top, height, backgroundColor: palette.text }]} />
          <View style={[styles.repeatDot, { left: 6, top: dotTop - 9, backgroundColor: palette.text }]} />
          <View style={[styles.repeatDot, { left: 6, top: dotTop + 5, backgroundColor: palette.text }]} />
        </>
      ) : null}
      {header.repeatClose > 0 ? (
        <>
          <View style={[styles.thickBar, { right: 0, top, height, backgroundColor: palette.text }]} />
          <View style={[styles.repeatDot, { right: 6, top: dotTop - 9, backgroundColor: palette.text }]} />
          <View style={[styles.repeatDot, { right: 6, top: dotTop + 5, backgroundColor: palette.text }]} />
          <Text style={[styles.repeatCount, { color: palette.text }]}>x{header.repeatClose}</Text>
        </>
      ) : null}
    </>
  );
}

function TimeSignature({ header, stringCount, palette }: { header: MeasureHeader; stringCount: number; palette: Palette }) {
  const height = Math.max(TAB.stringGap * 2, (stringCount - 1) * TAB.stringGap);
  const fontSize = Math.min(22, height / 2);
  const left = TAB.padLeft + (header.repeatOpen ? TAB.repeatWidth : 0) - 4;
  const style = [styles.timeSignature, { fontSize, lineHeight: height / 2, color: palette.text, backgroundColor: palette.paper }];
  return (
    <View style={{ position: 'absolute', left, top: stringY(1), height }}>
      <Text style={style}>{header.timeSignature.numerator}</Text>
      <Text style={style}>{header.timeSignature.denominator}</Text>
    </View>
  );
}

interface BeatViewProps extends TabMeasureProps {
  readonly beat: Beat;
  readonly previousBeat?: Beat;
  readonly beatIndex: number;
  readonly x: number;
  readonly isBeamed: boolean;
}

function BeatView(props: BeatViewProps) {
  const { beat, previousBeat: before, x, isBeamed, track, palette } = props;
  const marks = beatMarks(beat, before);
  const voice = primaryVoice(beat);
  const bottom = stringY(track.strings.length);
  return (
    <>
      {marks.length > 0 ? (
        <Text numberOfLines={1} style={[styles.marks, { left: x - MARK_INSET, color: palette.muted }]}>
          {marks.join(' ')}
        </Text>
      ) : null}
      {beat.voices.map((v, voiceIndex) =>
        v.notes.map((note, noteIndex) => (
          <FretNumber key={`${voiceIndex}-${noteIndex}`} {...props} voiceIndex={voiceIndex} noteIndex={noteIndex} label={fretLabel(note)} string={note.string} />
        )),
      )}
      {voice !== undefined && voice.notes.length === 0 ? (
        <RestMark value={voice.duration.value} x={x} middle={stringY((track.strings.length + 1) / 2)} color={palette.text} />
      ) : null}
      {voice !== undefined ? <RhythmStem voice={voice} x={x} top={bottom + STEM_GAP} isBeamed={isBeamed} palette={palette} /> : null}
    </>
  );
}

interface FretNumberProps extends BeatViewProps {
  readonly voiceIndex: number;
  readonly noteIndex: number;
  readonly label: string;
  readonly string: number;
}

function FretNumber({ trackIndex, layout, beatIndex, voiceIndex, noteIndex, label, string, x, selection, palette, onSelectNote }: FretNumberProps) {
  const address: NoteAddress = { trackIndex: trackIndex, measureIndex: layout.measureIndex, beatIndex: beatIndex, voiceIndex: voiceIndex, noteIndex: noteIndex };
  const isSelected =
    selection !== undefined &&
    selection.trackIndex === trackIndex &&
    selection.measureIndex === layout.measureIndex &&
    selection.beatIndex === beatIndex &&
    selection.voiceIndex === voiceIndex &&
    selection.noteIndex === noteIndex;
  return (
    <Pressable
      onPress={() => onSelectNote(address)}
      style={[
        styles.fretBox,
        { left: x - FRET_BOX.width / 2, top: stringY(string) - FRET_BOX.height / 2 },
        { backgroundColor: isSelected ? palette.selection : palette.paper },
      ]}
    >
      <Text style={[styles.fret, { color: voiceIndex > 0 ? palette.accent : palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stringLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2 },
  barLine: { position: 'absolute', width: 1 },
  thickBar: { position: 'absolute', width: 3 },
  repeatDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  repeatCount: { position: 'absolute', right: 2, top: 30, fontSize: 10, fontWeight: '600' },
  measureNumber: { position: 'absolute', left: 2, top: 2, fontSize: 9 },
  marker: { position: 'absolute', left: MARKER_LEFT, top: 0, fontSize: 11, fontWeight: '700' },
  tempo: { position: 'absolute', left: 2, top: 14, fontSize: 10, fontWeight: '600' },
  ending: { position: 'absolute', left: 0, top: 22, fontSize: 10, paddingLeft: 3, borderLeftWidth: 1, borderTopWidth: 1, width: 60 },
  timeSignature: { fontFamily: MONO_FONT, fontWeight: '800', textAlign: 'center', width: 18 },
  marks: { position: 'absolute', top: TAB.marksTop, width: 64, fontSize: 9 },
  fretBox: { position: 'absolute', width: FRET_BOX.width, height: FRET_BOX.height, alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  fret: { fontFamily: MONO_FONT, fontSize: 11, fontWeight: '600' },
});

export const TabMeasure = memo(TabMeasureView);
