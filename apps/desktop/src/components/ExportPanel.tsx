import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Song, stylesheetOf } from '@gp-editor/core';
import { type ExportMode, exportBaseName, exportStaves, pdfPageCount, printedPage } from '../export/pdf-document';
import { DEFAULT_PNG_OPTIONS, PNG_RESOLUTIONS, type PngOptions, pngFileNames, pngFilesText, pngPixelSize } from '../export/png-export';
import type { ExportFormat } from '../hooks/use-pdf-export';
import { pageSummary } from '../lib/stylesheet-draft';
import { plural } from '../lib/wording';
import type { ChordDisplay } from '../score/chords';
import { SCORE_MODES, SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import type { StaffSpec } from '../score/score-layout';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface ExportPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The shown track: the one exported. */
  readonly trackIndex: number;
  /** The multitrack view's staves: with several, they are exported, each track as shown unless one mode is chosen. */
  readonly staves?: readonly StaffSpec[];
  /** The open file's name, the title of a song without one. */
  readonly fileName: string;
  /** The score's view mode, selected when the panel opens. */
  readonly mode: ScoreMode;
  /** What the score shows of its chords, for the page count. */
  readonly chordDisplay?: ChordDisplay;
  /** A PDF, or PNG images (one per page of the same layout). */
  readonly format: ExportFormat;
  readonly isSaving: boolean;
  readonly onSave: (mode: ExportMode) => void;
  readonly onSavePng: (mode: ExportMode, png: PngOptions) => void;
  readonly onClose: () => void;
  /** File ▸ Stylesheet…: the page the export prints on is the stylesheet's. */
  readonly onOpenStylesheet?: () => void;
}

/** The Show choice's buttons: "As Shown" first in the multitrack view. */
const AS_SHOWN_LABEL = 'As Shown';

interface PngSummaryInput {
  readonly song: Song;
  readonly trackIndex: number;
  readonly staves?: readonly StaffSpec[];
  readonly fileName: string;
  readonly mode: ScoreMode;
  readonly pageCount: number;
  readonly png: PngOptions;
}

/** "3 pages → Song (Tab)-1.png … Song (Tab)-3.png, 1240 × 1754 px each, into a folder you choose". */
function pngSummary({ song, trackIndex, staves, fileName, mode, pageCount, png }: PngSummaryInput): string {
  const names = pngFileNames(exportBaseName(song, trackIndex, mode, fileName, staves), pageCount);
  const { width, height } = pngPixelSize(printedPage(stylesheetOf(song).page), png.dpi);
  const size = `${width} × ${height} px`;
  return pageCount === 1
    ? `1 page → ${pngFilesText(names)}, ${size}`
    : `${plural(pageCount, 'page')} → ${pngFilesText(names)}, ${size} each, into a folder you choose`;
}

interface PngOptionsRowProps {
  readonly palette: Palette;
  readonly png: PngOptions;
  readonly onChange: (png: PngOptions) => void;
}

/** Resolution (72 / 150 / 300 dpi) and background (white paper or transparent). */
function PngOptionsRow({ palette, png, onChange }: PngOptionsRowProps) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.text }]}>Resolution</Text>
      {PNG_RESOLUTIONS.map((dpi) => (
        <BarButton key={dpi} label={`${dpi} dpi`} palette={palette} isActive={dpi === png.dpi} onPress={() => onChange({ ...png, dpi })} />
      ))}
      <Text style={[styles.label, styles.spaced, { color: palette.text }]}>Background</Text>
      <BarButton label="White" palette={palette} isActive={!png.isTransparent} onPress={() => onChange({ ...png, isTransparent: false })} />
      <BarButton label="Transparent" palette={palette} isActive={png.isTransparent} onPress={() => onChange({ ...png, isTransparent: true })} />
    </View>
  );
}

/**
 * Export (Export… button, File ▸ Export PDF… / Export PNG…): the shown track as Score + Tab, Score or Tab (the
 * multitrack view's tracks As Shown, or all in one of those) on the stylesheet's page (Stylesheet… changes it), with the
 * number of pages it makes; Save PDF… asks where to save it. For PNG images, also the resolution and the background, and
 * the files it writes (one per page).
 */
export function ExportPanel(props: ExportPanelProps) {
  const { palette, song, trackIndex, staves = [], fileName, mode: viewMode, chordDisplay, format, isSaving, onSave, onSavePng, onClose, onOpenStylesheet } = props;
  const isMultitrack = staves.length > 1;
  const [choice, setChoice] = useState<ExportMode>(isMultitrack ? 'asShown' : viewMode);
  const mode = choice === 'asShown' ? viewMode : choice;
  const printed = useMemo(() => exportStaves(staves, choice), [staves, choice]);
  const [png, setPng] = useState<PngOptions>(DEFAULT_PNG_OPTIONS);
  const pageCount = useMemo(() => pdfPageCount(song, trackIndex, mode, { fileName, chordDisplay, staves: printed }), [song, trackIndex, mode, fileName, chordDisplay, printed]);
  const trackName = song.tracks[trackIndex]?.name ?? '';
  const isPng = format === 'png';
  const summary = isPng ? pngSummary({ song, trackIndex, staves: printed, fileName, mode, pageCount, png }) : plural(pageCount, 'page');
  const what = isMultitrack ? `${plural(staves.length, 'track')} as the score shows them` : trackName === '' ? 'The shown track' : `Track “${trackName}”`;
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{isPng ? 'Export PNG' : 'Export PDF'}</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>
          {what}, every bar, {isPng ? 'one image per page, as in the PDF.' : 'in black on white.'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Show</Text>
        {isMultitrack ? <BarButton label={AS_SHOWN_LABEL} palette={palette} isActive={choice === 'asShown'} onPress={() => setChoice('asShown')} /> : null}
        {SCORE_MODES.map((option) => (
          <BarButton key={option} label={SCORE_MODE_LABELS[option]} palette={palette} isActive={option === choice} onPress={() => setChoice(option)} />
        ))}
        <Text style={[styles.label, styles.spaced, { color: palette.text }]}>Page</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>{pageSummary(stylesheetOf(song).page)}</Text>
        {onOpenStylesheet === undefined ? null : <BarButton label="Stylesheet…" palette={palette} onPress={onOpenStylesheet} />}
      </View>
      {isPng ? <PngOptionsRow palette={palette} png={png} onChange={setPng} /> : null}
      <View style={styles.row}>
        <BarButton
          label={isPng ? 'Save PNG…' : 'Save PDF…'}
          palette={palette}
          isAccent
          isEnabled={!isSaving}
          onPress={() => (isPng ? onSavePng(choice, png) : onSave(choice))}
        />
        <BarButton label="Close" palette={palette} onPress={onClose} />
        <Text style={[styles.hint, { color: palette.muted }]}>{isSaving ? 'Saving…' : summary}</Text>
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
