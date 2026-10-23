import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { DEFAULT_PAPER, PAPER_IDS, PAPER_SIZES, type PaperId } from '../export/paper';
import { pdfPageCount } from '../export/pdf-document';
import type { ChordDisplay } from '../score/chords';
import { SCORE_MODES, SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface ExportPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The shown track: the one exported. */
  readonly trackIndex: number;
  /** The open file's name, the title of a song without one. */
  readonly fileName: string;
  /** The score's view mode, selected when the panel opens. */
  readonly mode: ScoreMode;
  /** What the score shows of its chords, for the page count. */
  readonly chordDisplay?: ChordDisplay;
  readonly isSaving: boolean;
  readonly onSave: (mode: ScoreMode, paper: PaperId) => void;
  readonly onClose: () => void;
}

function pagesText(count: number): string {
  return count === 1 ? '1 page' : `${count} pages`;
}

/**
 * PDF export (Export… button, File ▸ Export PDF… / ⌘P): the shown track as Score + Tab, Score or Tab on A4 or US Letter,
 * with the number of pages it makes; Save PDF… asks where to save it.
 */
export function ExportPanel({ palette, song, trackIndex, fileName, mode: viewMode, chordDisplay, isSaving, onSave, onClose }: ExportPanelProps) {
  const [mode, setMode] = useState<ScoreMode>(viewMode);
  const [paper, setPaper] = useState<PaperId>(DEFAULT_PAPER);
  const pageCount = useMemo(() => pdfPageCount(song, trackIndex, mode, { paper, fileName, chordDisplay }), [song, trackIndex, mode, paper, fileName, chordDisplay]);
  const trackName = song.tracks[trackIndex]?.name ?? '';
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>Export PDF</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>
          {trackName === '' ? 'The shown track' : `Track “${trackName}”`}, every bar, in black on white.
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Show</Text>
        {SCORE_MODES.map((option) => (
          <BarButton key={option} label={SCORE_MODE_LABELS[option]} palette={palette} isActive={option === mode} onPress={() => setMode(option)} />
        ))}
        <Text style={[styles.label, styles.spaced, { color: palette.text }]}>Paper</Text>
        {PAPER_IDS.map((option) => (
          <BarButton key={option} label={PAPER_SIZES[option].name} palette={palette} isActive={option === paper} onPress={() => setPaper(option)} />
        ))}
      </View>
      <View style={styles.row}>
        <BarButton label="Save PDF…" palette={palette} isAccent isEnabled={!isSaving} onPress={() => onSave(mode, paper)} />
        <BarButton label="Close" palette={palette} onPress={onClose} />
        <Text style={[styles.hint, { color: palette.muted }]}>{isSaving ? 'Saving…' : pagesText(pageCount)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  label: { fontSize: 12, fontWeight: '600', marginRight: 8 },
  spaced: { marginLeft: 12 },
  hint: { fontSize: 11, marginLeft: 4, marginRight: 8 },
});
