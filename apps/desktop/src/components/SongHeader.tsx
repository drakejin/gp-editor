import { memo } from 'react';
import { StyleSheet, Text, type TextStyle, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { type TitleLine, titleBlockLines } from '../export/title-block';
import { useLanguage } from '../hooks/use-i18n';
import type { Palette } from '../theme';

interface SongHeaderProps {
  readonly song: Song;
  readonly trackIndex: number;
  readonly fileName: string;
  readonly palette: Palette;
}

/**
 * The top of the score page, as Guitar Pro and the PDF export lay it out: title, subtitle, artist and album centred,
 * the author and tab credits, then the shown track with its instrument and tuning on the left.
 */
function SongHeaderView({ song, trackIndex, fileName, palette }: SongHeaderProps) {
  // The credits' words ("Music:", "작곡:") follow the language.
  useLanguage();
  const lines = titleBlockLines(song, trackIndex, song.info.title || fileName);
  return (
    <View style={styles.container}>
      {lines.map((line) => (
        <Text key={line.kind} numberOfLines={line.kind === 'title' ? 2 : 1} style={[styles.line, LINE_STYLES[line.kind], { color: line.kind === 'album' || line.kind === 'credits' ? palette.muted : palette.text }]}>
          {line.text}
        </Text>
      ))}
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
  track: { fontSize: 12, fontWeight: '700', textAlign: 'left', marginTop: 14 },
};

const styles = StyleSheet.create({
  container: { paddingTop: 28, paddingBottom: 8 },
  line: { textAlign: 'center' },
});
