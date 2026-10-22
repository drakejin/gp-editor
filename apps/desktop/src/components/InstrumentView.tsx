import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { beatNotes } from '../lib/beat-notes';
import type { PlayingBeat } from '../score/row';
import { type Palette, onChrome } from '../theme';
import { Fretboard } from './Fretboard';

interface InstrumentViewProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  readonly palette: Palette;
}

/**
 * Guitar Pro's instrument view, above the tracks panel: the shown track's 24-fret neck with the notes of the playing
 * beat, else of the cursor's beat. Drum tracks have none.
 */
function InstrumentViewPanel({ song, trackIndex, cursor, playing, palette }: InstrumentViewProps) {
  const track = song.tracks[trackIndex];
  const shown = playing ?? cursor;
  const measureIndex = shown?.measureIndex;
  const beatIndex = shown?.beatIndex;
  const notes = useMemo(
    () => (measureIndex === undefined || beatIndex === undefined ? [] : beatNotes(song, trackIndex, measureIndex, beatIndex)),
    [song, trackIndex, measureIndex, beatIndex],
  );
  const chromePalette = useMemo(() => onChrome(palette), [palette]);
  if (track === undefined || track.isPercussion) {
    return null;
  }
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
      <Fretboard track={track} notes={notes} cursorString={playing === undefined ? cursor?.string : undefined} palette={chromePalette} />
    </View>
  );
}

export const InstrumentView = memo(InstrumentViewPanel);

const styles = StyleSheet.create({
  panel: { borderTopWidth: 1 },
});
