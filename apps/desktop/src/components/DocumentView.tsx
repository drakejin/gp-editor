import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StringAddress } from '@gp-editor/core';
import { beatNotes } from '../lib/beat-notes';
import { trackInstrument } from '../lib/instruments';
import type { RowHit } from '../score/hit-test';
import { type ScoreMode, showsFretboard } from '../score/geometry';
import type { PlayingBeat } from '../score/row';
import type { OpenDocument } from '../state/editor';
import type { Palette } from '../theme';
import { Fretboard } from './Fretboard';
import { InstrumentPicker } from './InstrumentPicker';
import { NeckSettings } from './NeckSettings';
import { ScoreView } from './ScoreView';
import { SongHeader } from './SongHeader';
import { TrackList } from './TrackList';

interface DocumentViewProps {
  readonly document: OpenDocument;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  /** What the last retune could not keep, shown with the neck settings. */
  readonly notice?: string;
  readonly palette: Palette;
  readonly onSelectTrack: (trackIndex: number) => void;
  readonly onPressBeat: (hit: RowHit) => void;
  readonly onSetTrackTuning: (trackIndex: number, tuning: readonly number[]) => void;
  readonly onSetTrackProgram: (trackIndex: number, program: number) => void;
  readonly onDismissNotice: () => void;
}

/**
 * An open song: tracks (with their instruments) on the left; the instrument picker when open, song info, the neck with
 * its settings (with the tab) and the score on the right.
 */
export function DocumentView(props: DocumentViewProps) {
  const { document, trackIndex, mode, cursor, playing, notice, palette, onSelectTrack, onPressBeat, onSetTrackTuning, onDismissNotice } = props;
  const { song } = document;
  const track = song.tracks[trackIndex];
  const instruments = useMemo(() => song.tracks.map((_, index) => trackInstrument(song, index)), [song]);
  // Track whose instrument is being picked.
  const [pickingTrackIndex, setPickingTrackIndex] = useState<number | undefined>(undefined);
  const picking = pickingTrackIndex === undefined ? undefined : instruments[pickingTrackIndex];
  const editInstrument = (index: number) => {
    onSelectTrack(index);
    setPickingTrackIndex(index);
  };
  const shownBeat = playing ?? cursor;
  const shownMeasureIndex = shownBeat?.measureIndex;
  const shownBeatIndex = shownBeat?.beatIndex;
  const fretboardNotes = useMemo(
    () =>
      shownMeasureIndex === undefined || shownBeatIndex === undefined
        ? []
        : beatNotes(song, trackIndex, shownMeasureIndex, shownBeatIndex),
    [song, trackIndex, shownMeasureIndex, shownBeatIndex],
  );
  if (track === undefined) {
    return null;
  }
  return (
    <View style={styles.body}>
      <TrackList
        tracks={song.tracks}
        instruments={instruments}
        selectedTrackIndex={trackIndex}
        palette={palette}
        onSelectTrack={onSelectTrack}
        onEditInstrument={editInstrument}
      />
      <View style={styles.main}>
        {pickingTrackIndex !== undefined && picking !== undefined && !picking.isPercussion ? (
          <InstrumentPicker
            trackName={song.tracks[pickingTrackIndex]?.name ?? ''}
            program={picking.program}
            palette={palette}
            onSetProgram={(program) => props.onSetTrackProgram(pickingTrackIndex, program)}
            onClose={() => setPickingTrackIndex(undefined)}
          />
        ) : null}
        <SongHeader song={song} fileName={document.fileName} palette={palette} />
        {showsFretboard(mode, track) ? (
          <>
            <NeckSettings
              song={song}
              trackIndex={trackIndex}
              notice={notice}
              palette={palette}
              onSetTuning={(tuning) => onSetTrackTuning(trackIndex, tuning)}
              onDismissNotice={onDismissNotice}
            />
            <Fretboard track={track} notes={fretboardNotes} cursorString={playing === undefined ? cursor?.string : undefined} palette={palette} />
          </>
        ) : null}
        <ScoreView song={song} trackIndex={trackIndex} mode={mode} cursor={cursor} playing={playing} palette={palette} onPressBeat={onPressBeat} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
});
