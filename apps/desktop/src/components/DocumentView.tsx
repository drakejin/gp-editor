import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StringAddress } from '@gp-editor/core';
import { beatNotes } from '../lib/beat-notes';
import type { RowHit } from '../score/hit-test';
import type { ScoreMode } from '../score/geometry';
import type { PlayingBeat } from '../score/row';
import type { OpenDocument } from '../state/editor';
import type { Palette } from '../theme';
import { Fretboard } from './Fretboard';
import { ScoreView } from './ScoreView';
import { SongHeader } from './SongHeader';
import { TrackList } from './TrackList';

interface DocumentViewProps {
  readonly document: OpenDocument;
  readonly trackIndex: number;
  readonly mode: ScoreMode;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  readonly palette: Palette;
  readonly onSelectTrack: (trackIndex: number) => void;
  readonly onPressBeat: (hit: RowHit) => void;
}

/** An open song: tracks on the left; song info, the neck (tab mode) and the score on the right. */
export function DocumentView({ document, trackIndex, mode, cursor, playing, palette, onSelectTrack, onPressBeat }: DocumentViewProps) {
  const { song } = document;
  const track = song.tracks[trackIndex];
  const shownBeat = playing ?? cursor;
  const fretboardNotes = useMemo(
    () => (shownBeat === undefined ? [] : beatNotes(song, trackIndex, shownBeat.measureIndex, shownBeat.beatIndex)),
    [song, trackIndex, shownBeat?.measureIndex, shownBeat?.beatIndex],
  );
  if (track === undefined) {
    return null;
  }
  return (
    <View style={styles.body}>
      <TrackList tracks={song.tracks} selectedTrackIndex={trackIndex} palette={palette} onSelectTrack={onSelectTrack} />
      <View style={styles.main}>
        <SongHeader song={song} fileName={document.fileName} palette={palette} />
        {mode === 'tab' ? (
          <Fretboard track={track} notes={fretboardNotes} cursorString={playing === undefined ? cursor?.string : undefined} palette={palette} />
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
