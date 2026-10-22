import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StringAddress } from '@gp-editor/core';
import { beatNotes } from '../lib/beat-notes';
import type { RowHit } from '../score/hit-test';
import { type ScoreMode, showsFretboard } from '../score/geometry';
import type { PlayingBeat } from '../score/row';
import type { OpenDocument } from '../state/editor';
import type { Palette } from '../theme';
import { Fretboard } from './Fretboard';
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
  readonly onDismissNotice: () => void;
}

/** An open song: tracks on the left; song info, the neck with its settings (with the tab) and the score on the right. */
export function DocumentView({ document, trackIndex, mode, cursor, playing, notice, palette, onSelectTrack, onPressBeat, onSetTrackTuning, onDismissNotice }: DocumentViewProps) {
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
