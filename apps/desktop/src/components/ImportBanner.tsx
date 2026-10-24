import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import type { PdfImport } from '../hooks/use-pdf-import';
import { TRANSCRIPTION_MODELS } from '../pdf-import/request';
import { importProgressText, projectStatusText } from '../pdf-import/status';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface ImportBannerProps {
  readonly palette: Palette;
  readonly pdfImport: PdfImport;
  readonly onOpenSettings: () => void;
}

/**
 * The running import's progress, then how it went: warnings, Resume for missing pages, the import settings (key and
 * model), the project in Finder.
 */
export function ImportBanner({ palette, pdfImport, onOpenSettings }: ImportBannerProps) {
  const [showsWarnings, setShowsWarnings] = useState(false);
  const t = useT();
  const { current, isRunning, error } = pdfImport;
  if (current === undefined && error === undefined) {
    return null;
  }
  const project = current?.project;
  const modelName = TRANSCRIPTION_MODELS.find((model) => model.id === project?.model)?.name ?? project?.model ?? '';
  const line =
    project === undefined ? error ?? '' : isRunning ? importProgressText(project, modelName) : t('window.import.projectLine', { name: project.name, status: projectStatusText(project) });
  const warnings = project?.warnings ?? [];
  const canResume = !isRunning && project !== undefined && project.status !== 'done' && current !== undefined;
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text numberOfLines={2} style={[styles.line, { color: error === undefined ? palette.text : palette.danger }]}>
          {error !== undefined && project !== undefined ? `${line} — ${error}` : line}
        </Text>
        {isRunning ? <BarButton label={t('common.cancel')} palette={palette} onPress={pdfImport.cancel} /> : null}
        {!isRunning && warnings.length > 0 ? (
          <BarButton
            label={`${t('window.import.warnings', { count: warnings.length })} ${showsWarnings ? '▴' : '▾'}`}
            palette={palette}
            isActive={showsWarnings}
            onPress={() => setShowsWarnings(!showsWarnings)}
          />
        ) : null}
        {canResume ? <BarButton label={t('common.resume')} palette={palette} isAccent onPress={() => pdfImport.resume(current.path)} /> : null}
        {!isRunning ? <BarButton label={t('window.import.settings')} palette={palette} onPress={onOpenSettings} /> : null}
        {current !== undefined ? <BarButton label={t('common.showInFinder')} palette={palette} onPress={() => pdfImport.reveal(current.path)} /> : null}
        {!isRunning ? <BarButton label={t('common.dismiss')} palette={palette} onPress={pdfImport.dismiss} /> : null}
      </View>
      {showsWarnings && !isRunning
        ? warnings.map((warning, index) => (
            <Text key={`${index}:${warning}`} style={[styles.warning, { color: palette.muted }]}>
              {`• ${warning}`}
            </Text>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 },
  line: { fontSize: 12, fontWeight: '600', marginRight: 10, flexShrink: 1 },
  warning: { fontSize: 11, marginTop: 2 },
});
