import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { type LyricsDraft, gp5LyricsNote, lyricsFit } from '../../lib/lyrics-draft';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { TextField } from '../TextField';

export interface LyricsPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly draft: LyricsDraft;
  readonly onChooseTrack: (trackIndex: number) => void;
  readonly onChangeFrom: (from: number) => void;
  readonly onChangeText: (text: string) => void;
  readonly onClose: () => void;
}

/** Lines of text the field shows before it scrolls. */
const TEXT_LINES = 5;
const LINE_HEIGHT = 17;

/** Guitar Pro's lyrics syntax, as the score reads it (gp-core's lyricsSyllables). */
const SYNTAX =
  'One syllable per note: a space or a hyphen ends one (Beau-ti-ful), two spaces skip a note, + sings words on one note (a+lot), [brackets] hold a comment. Korean, Japanese and Chinese: one character per note.';

/**
 * Edit ▸ Lyrics…: a track's lyrics and the bar they start at, as in Guitar Pro's lyrics editor. Above the score, which
 * follows the typing (useLyricsEditor applies it once the typing pauses).
 */
export function LyricsPanel({ palette, song, draft, onChooseTrack, onChangeFrom, onChangeText, onClose }: LyricsPanelProps) {
  const lastBar = Math.max(1, song.measureHeaders.length);
  const note = gp5LyricsNote(song, draft.trackIndex);
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Lyrics">
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.chromeText }]}>Lyrics</Text>
        <Text style={[styles.label, { color: palette.chromeMuted }]}>TRACK</Text>
        {song.tracks.map((track, index) => (
          <ChromeButton key={track.number} palette={palette} label={track.name || `Track ${track.number}`} tooltip={`Lyrics of track ${track.number}, ${track.name}`} fontSize={11} isActive={index === draft.trackIndex} onPress={() => onChooseTrack(index)} />
        ))}
        <Text style={[styles.label, styles.spaced, { color: palette.chromeMuted }]}>FROM BAR</Text>
        <ChromeButton palette={palette} label="−" tooltip="Start a bar earlier" isEnabled={draft.from > 1} onPress={() => onChangeFrom(draft.from - 1)} />
        <Text style={[styles.bar, { color: palette.chromeText }]}>{draft.from}</Text>
        <ChromeButton palette={palette} label="+" tooltip="Start a bar later" isEnabled={draft.from < lastBar} onPress={() => onChangeFrom(draft.from + 1)} />
        <View style={styles.fill} />
        <ChromeButton palette={palette} label="Close" tooltip="Close the lyrics editor" fontSize={11} onPress={onClose} />
      </View>
      <TextField
        accessibilityLabel="Lyrics text"
        value={draft.text}
        onChangeText={onChangeText}
        multiline
        autoFocus
        placeholder="Type the lyrics, one syllable per note"
        placeholderTextColor={palette.chromeMuted}
        style={[styles.text, { color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
      />
      <Text style={[styles.hint, { color: palette.chromeMuted }]}>{SYNTAX}</Text>
      <Text style={[styles.hint, { color: palette.chromeText }]}>{lyricsFit(song, draft)}</Text>
      {note === undefined ? null : <Text style={[styles.hint, { color: palette.chromeMuted }]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, rowGap: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 },
  title: { fontSize: 13, fontWeight: '800', marginRight: 14 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginRight: 4 },
  spaced: { marginLeft: 14 },
  bar: { minWidth: 28, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  fill: { flex: 1 },
  text: { height: TEXT_LINES * LINE_HEIGHT + 10, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 13 },
  hint: { fontSize: 11 },
});
