import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { SongWriterDraft } from '../../hooks/use-song-writer';
import { lengthLabel } from '../../song-writer/request';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';

/** Genres offered as one-click choices; any other can be typed. */
const GENRES: readonly string[] = ['Pop', 'Rock', 'Ballad', 'Blues', 'Folk', 'Metal', 'Jazz', 'Funk'];

/** Song lengths, in seconds: −/+ steps of LENGTH_STEP between the two bounds. */
const MIN_LENGTH = 20;
const MAX_LENGTH = 300;
const LENGTH_STEP = 15;

export interface SongWriterFieldsProps {
  readonly palette: Palette;
  readonly draft: SongWriterDraft;
  readonly onChangeDraft: (change: Partial<SongWriterDraft>) => void;
  /** What the open score is ("song.gp5 · Lead"), or undefined when there is nothing to build on. */
  readonly reference?: string;
}

function Row({ palette, label, children }: { readonly palette: Palette; readonly label: string; readonly children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.chromeMuted }]}>{label.toUpperCase()}</Text>
      <View style={styles.field}>{children}</View>
    </View>
  );
}

/** A one-line field, or room for `lines` lines of text. */
const LINE_HEIGHT = 16;
const fieldHeight = (lines: number): number => (lines > 1 ? lines * LINE_HEIGHT + 10 : 24);

function Field({ palette, label, value, placeholder, lines = 1, onChange }: { readonly palette: Palette; readonly label: string; readonly value: string; readonly placeholder: string; readonly lines?: number; readonly onChange: (text: string) => void }) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={palette.chromeMuted}
      multiline={lines > 1}
      style={[styles.input, { height: fieldHeight(lines), color: palette.chromeText, borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}
    />
  );
}

/** The song the user asks for: title, genre, length, lyrics, description, and whether to build on the open score. */
export function SongWriterFields({ palette, draft, onChangeDraft, reference }: SongWriterFieldsProps) {
  const step = (delta: number) => onChangeDraft({ lengthSeconds: Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, draft.lengthSeconds + delta)) });
  return (
    <>
      <Row palette={palette} label="Title">
        <Field palette={palette} label="Title" value={draft.title} placeholder="Leave empty and Claude names it" onChange={(title) => onChangeDraft({ title })} />
      </Row>
      <Row palette={palette} label="Genre">
        <Field palette={palette} label="Genre" value={draft.genre} placeholder="e.g. Indie folk, 80s hard rock" onChange={(genre) => onChangeDraft({ genre })} />
        <View style={styles.choices}>
          {GENRES.map((genre) => (
            <ChromeButton key={genre} palette={palette} label={genre} tooltip={`Genre: ${genre}`} fontSize={11} isActive={draft.genre === genre} onPress={() => onChangeDraft({ genre })} />
          ))}
        </View>
      </Row>
      <Row palette={palette} label="Length">
        <View style={styles.choices}>
          <ChromeButton palette={palette} label="−" tooltip="Shorter" isEnabled={draft.lengthSeconds > MIN_LENGTH} onPress={() => step(-LENGTH_STEP)} />
          <Text style={[styles.length, { color: palette.chromeText }]}>{lengthLabel(draft.lengthSeconds)}</Text>
          <ChromeButton palette={palette} label="+" tooltip="Longer" isEnabled={draft.lengthSeconds < MAX_LENGTH} onPress={() => step(LENGTH_STEP)} />
        </View>
      </Row>
      <Row palette={palette} label="Lyrics">
        <Field palette={palette} label="Lyrics" value={draft.lyrics} placeholder="Sung as written, in order; leave empty and Claude writes them" lines={7} onChange={(lyrics) => onChangeDraft({ lyrics })} />
      </Row>
      <Row palette={palette} label="About">
        <Field palette={palette} label="Description" value={draft.description} placeholder="Mood, story, instruments, references…" lines={3} onChange={(description) => onChangeDraft({ description })} />
      </Row>
      <Row palette={palette} label="Reference">
        <View style={styles.choices}>
          <ChromeButton
            palette={palette}
            label={`${draft.usesReference && reference !== undefined ? '☑' : '☐'} Build on the open score`}
            tooltip="Build on the open score: its notes, melody and rhythm"
            fontSize={11}
            isEnabled={reference !== undefined}
            onPress={() => onChangeDraft({ usesReference: !draft.usesReference })}
          />
          <Text style={[styles.note, { color: palette.chromeMuted }]}>{reference ?? 'Open a score to build on its melody and rhythm'}</Text>
        </View>
      </Row>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  label: { width: 78, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, paddingTop: 6 },
  field: { flex: 1 },
  input: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4, rowGap: 2 },
  length: { width: 44, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  note: { fontSize: 11, marginLeft: 6 },
});
