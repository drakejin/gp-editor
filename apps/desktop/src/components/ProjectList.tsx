import { StyleSheet, Text, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import type { ProjectSummary } from '../hooks/use-pdf-import';
import { projectStatusText } from '../pdf-import/status';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface ProjectListProps {
  readonly projects: readonly ProjectSummary[];
  readonly palette: Palette;
  readonly onOpenSong: (songPath: string) => void;
  readonly onResume: (projectPath: string) => void;
  readonly onReveal: (projectPath: string) => void;
}

/** How many recent projects the start screen lists. */
const SHOWN_PROJECTS = 6;

/** Recent PDF import projects: open the song, resume an unfinished one, or show the folder. */
export function ProjectList({ projects, palette, onOpenSong, onResume, onReveal }: ProjectListProps) {
  const t = useT();
  if (projects.length === 0) {
    return null;
  }
  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: palette.muted }]}>{t('window.start.projects')}</Text>
      {projects.slice(0, SHOWN_PROJECTS).map(({ path, name, project }) => (
        <View key={path} style={[styles.item, { borderColor: palette.border }]}>
          <View style={styles.texts}>
            <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>{name}</Text>
            <Text numberOfLines={1} style={[styles.status, { color: palette.muted }]}>
              {project === undefined ? t('window.start.noProjectFile') : projectStatusText(project)}
            </Text>
          </View>
          {project?.songFile !== undefined ? (
            <BarButton label={t('common.open')} palette={palette} isAccent onPress={() => onOpenSong(`${path}/${project.songFile}`)} />
          ) : null}
          {project !== undefined && project.status !== 'done' ? <BarButton label={t('common.resume')} palette={palette} onPress={() => onResume(path)} /> : null}
          <BarButton label={t('common.showInFinder')} palette={palette} onPress={() => onReveal(path)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 26, width: 560 },
  heading: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  texts: { flex: 1, marginRight: 8 },
  name: { fontSize: 13, fontWeight: '600' },
  status: { fontSize: 11, marginTop: 1 },
});
