import { type ReactElement, memo } from 'react';
import { StyleSheet, Text, type TextStyle, View } from 'react-native';
import { DEFAULT_STYLESHEET, type Song, type TextElement, type TextStyle as SheetTextStyle, stylesheetOf } from '@gp-editor/core';
import { type TitleLine, titleBlockLines, titleLineElement } from '../export/title-block';
import { useLanguage } from '../hooks/use-i18n';
import { isSameTextStyle } from '../score/text-styles';
import type { Palette } from '../theme';

interface SongHeaderProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly fileName: string;
  readonly palette: Palette;
}

/** The stylesheet's font for a text of the header as React Native draws it; none while it is the default one. */
function fontStyle(texts: Readonly<Record<TextElement, SheetTextStyle>>, element: TextElement): TextStyle | undefined {
  const style = texts[element];
  if (isSameTextStyle(style, DEFAULT_STYLESHEET.texts[element])) {
    return undefined;
  }
  return { fontSize: style.size, fontWeight: style.isBold ? '700' : '400', fontStyle: style.isItalic ? 'italic' : 'normal', ...(style.family === '' ? {} : { fontFamily: style.family }) };
}

/** The credits line's credits, each in its own font, when the stylesheet styles one of them. */
function creditSpans(line: TitleLine, texts: Readonly<Record<TextElement, SheetTextStyle>>): string | readonly ReactElement[] {
  const parts = line.parts ?? [];
  if (parts.every((part) => fontStyle(texts, part.element) === undefined)) {
    return line.text;
  }
  return parts.map((part, i) => (
    <Text key={part.element} style={fontStyle(texts, part.element)}>
      {i === parts.length - 1 ? part.text : `${part.text}  ·  `}
    </Text>
  ));
}

/**
 * The top of the score page, as Guitar Pro and the PDF export lay it out: title, subtitle, artist and album centred,
 * the author and tab credits, then the shown track with its instrument and tuning on the left — the song information
 * the stylesheet shows, in its fonts.
 */
function SongHeaderView({ song, trackIndex, fileName, palette }: SongHeaderProps) {
  // The credits' words ("Music:", "작곡:") follow the language.
  useLanguage();
  const lines = titleBlockLines(song, trackIndex, song.info.title || fileName);
  const { texts } = stylesheetOf(song);
  return (
    <View style={styles.container}>
      {lines.map((line) => {
        const element = titleLineElement(line.kind);
        const font = element === undefined ? undefined : fontStyle(texts, element);
        const color = line.kind === 'album' || line.kind === 'credits' || line.kind === 'copyright' ? palette.muted : palette.text;
        return (
          <Text key={line.kind} numberOfLines={line.kind === 'title' ? 2 : 1} style={[styles.line, LINE_STYLES[line.kind], { color }, font]}>
            {line.kind === 'credits' ? creditSpans(line, texts) : line.text}
          </Text>
        );
      })}
    </View>
  );
}

/** Memoized: it only changes with its own props, not with the cursor or the playing beat. */
export const SongHeader = memo(SongHeaderView);

const LINE_STYLES: Readonly<Record<TitleLine['kind'], TextStyle>> = {
  title: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 16 },
  artist: { fontSize: 15, marginTop: 2 },
  album: { fontSize: 12, marginTop: 2 },
  credits: { fontSize: 11, marginTop: 6 },
  copyright: { fontSize: 11, marginTop: 2 },
  track: { fontSize: 12, fontWeight: '700', textAlign: 'left', marginTop: 14 },
};

const styles = StyleSheet.create({
  container: { paddingTop: 28, paddingBottom: 8 },
  line: { textAlign: 'center' },
});
