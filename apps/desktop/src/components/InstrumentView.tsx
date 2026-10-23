import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { beatNotes } from '../lib/beat-notes';
import { soundingPitches } from '../score/keyboard';
import type { PlayingBeat } from '../score/row';
import { type Palette, onChrome } from '../theme';
import { DrumKit } from './DrumKit';
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
  /** A drum track's kit was clicked: the General MIDI key to enter at the cursor. */
  readonly onDrumHit?: (key: number) => void;
}

const NO_DRUM_HIT = (): void => undefined;

/**
 * Guitar Pro's instrument view, above the tracks panel: a piano keyboard and the shown track's 24-fret neck, each
 * lighting the notes of the playing beat, else of the cursor's beat. A drum track shows a drum kit instead (when either
 * part is on), its drums lit the same way; a click on a drum enters it.
 */
function InstrumentViewPanel({ song, trackIndex, cursor, playing, palette, showsKeyboard, showsFretboard, onDrumHit = NO_DRUM_HIT }: InstrumentViewProps) {
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
  const drumKeys = useMemo(() => notes.map((note) => note.fret), [notes]);
  if (track === undefined || (!showsKeyboard && !showsFretboard)) {
    return null;
  }
  if (track.isPercussion) {
    return (
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
        <DrumKit keys={drumKeys} palette={chromePalette} onHit={onDrumHit} />
      </View>
    );
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
