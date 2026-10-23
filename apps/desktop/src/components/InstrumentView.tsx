import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { beatNotes } from '../lib/beat-notes';
import { soundingPitches } from '../score/keyboard';
import type { PlayingBeat } from '../score/row';
import { type Palette, onChrome } from '../theme';
import { Fretboard } from './Fretboard';
import { Keyboard } from './Keyboard';

interface InstrumentViewProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly cursor?: StringAddress;
  readonly playing?: PlayingBeat;
  readonly palette: Palette;
  /** The piano keyboard (top bar toggle), above the fretboard. */
  readonly showsKeyboard: boolean;
  readonly showsFretboard: boolean;
}

/**
 * Guitar Pro's instrument view, above the tracks panel: a piano keyboard and the shown track's 24-fret neck, each
 * lighting the notes of the playing beat, else of the cursor's beat. Drum tracks have no pitches, so neither.
 */
function InstrumentViewPanel({ song, trackIndex, cursor, playing, palette, showsKeyboard, showsFretboard }: InstrumentViewProps) {
  const track = song.tracks[trackIndex];
  const shown = playing ?? cursor;
  const measureIndex = shown?.measureIndex;
  const beatIndex = shown?.beatIndex;
  const notes = useMemo(
    () => (measureIndex === undefined || beatIndex === undefined ? [] : beatNotes(song, trackIndex, measureIndex, beatIndex)),
    [song, trackIndex, measureIndex, beatIndex],
  );
  const pitches = useMemo(() => (track === undefined ? [] : soundingPitches(track, notes)), [track, notes]);
  const chromePalette = useMemo(() => onChrome(palette), [palette]);
  if (track === undefined || track.isPercussion || (!showsKeyboard && !showsFretboard)) {
    return null;
  }
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
      {showsKeyboard ? <Keyboard pitches={pitches} palette={chromePalette} /> : null}
      {showsFretboard ? <Fretboard track={track} notes={notes} cursorString={playing === undefined ? cursor?.string : undefined} palette={chromePalette} /> : null}
    </View>
  );
}

export const InstrumentView = memo(InstrumentViewPanel);

const styles = StyleSheet.create({
  panel: { borderTopWidth: 1 },
});
