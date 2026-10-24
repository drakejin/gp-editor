import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TextField } from '../TextField';
import { useT } from '../../hooks/use-i18n';
import type { SongWriterDraft } from '../../hooks/use-song-writer';
import type { MessageKey } from '../../lib/i18n/i18n';
import { lengthLabel } from '../../song-writer/request';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';

/** Genres offered as one-click choices, named in the shown language (Claude reads either); any other can be typed. */
const GENRES: readonly MessageKey[] = [
  'tools.songWriter.genre.pop',
  'tools.songWriter.genre.rock',
  'tools.songWriter.genre.ballad',
  'tools.songWriter.genre.blues',
  'tools.songWriter.genre.folk',
  'tools.songWriter.genre.metal',
  'tools.songWriter.genre.jazz',
  'tools.songWriter.genre.funk',
];

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
    <TextField
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
  const t = useT();
  const step = (delta: number) => onChangeDraft({ lengthSeconds: Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, draft.lengthSeconds + delta)) });
  return (
    <>
      <Row palette={palette} label={t('common.title')}>
        <Field palette={palette} label={t('common.title')} value={draft.title} placeholder={t('tools.songWriter.titlePlaceholder')} onChange={(title) => onChangeDraft({ title })} />
      </Row>
      <Row palette={palette} label={t('tools.songWriter.genre')}>
        <Field palette={palette} label={t('tools.songWriter.genre')} value={draft.genre} placeholder={t('tools.songWriter.genrePlaceholder')} onChange={(genre) => onChangeDraft({ genre })} />
        <View style={styles.choices}>
          {GENRES.map((key) => t(key)).map((genre) => (
            <ChromeButton key={genre} palette={palette} label={genre} tooltip={t('tools.songWriter.genreTooltip', { name: genre })} fontSize={11} isActive={draft.genre === genre} onPress={() => onChangeDraft({ genre })} />
          ))}
        </View>
      </Row>
      <Row palette={palette} label={t('tools.songWriter.length')}>
        <View style={styles.choices}>
          <ChromeButton palette={palette} label="−" tooltip={t('tools.songWriter.shorter')} isEnabled={draft.lengthSeconds > MIN_LENGTH} onPress={() => step(-LENGTH_STEP)} />
          <Text style={[styles.length, { color: palette.chromeText }]}>{lengthLabel(draft.lengthSeconds)}</Text>
          <ChromeButton palette={palette} label="+" tooltip={t('tools.songWriter.longer')} isEnabled={draft.lengthSeconds < MAX_LENGTH} onPress={() => step(LENGTH_STEP)} />
        </View>
      </Row>
      <Row palette={palette} label={t('common.lyrics')}>
        <Field palette={palette} label={t('common.lyrics')} value={draft.lyrics} placeholder={t('tools.songWriter.lyricsPlaceholder')} lines={7} onChange={(lyrics) => onChangeDraft({ lyrics })} />
      </Row>
      <Row palette={palette} label={t('tools.songWriter.about')}>
        <Field palette={palette} label={t('tools.songWriter.description')} value={draft.description} placeholder={t('tools.songWriter.descriptionPlaceholder')} lines={3} onChange={(description) => onChangeDraft({ description })} />
      </Row>
      <Row palette={palette} label={t('tools.songWriter.reference')}>
        <View style={styles.choices}>
          <ChromeButton
            palette={palette}
            label={`${draft.usesReference && reference !== undefined ? '☑' : '☐'} ${t('tools.songWriter.buildOn')}`}
            tooltip={t('tools.songWriter.buildOnTooltip')}
            fontSize={11}
            isEnabled={reference !== undefined}
            onPress={() => onChangeDraft({ usesReference: !draft.usesReference })}
          />
          <Text style={[styles.note, { color: palette.chromeMuted }]}>{reference ?? t('tools.songWriter.openScore')}</Text>
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
