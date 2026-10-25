import type { WindowModel } from '../../hooks/use-window';
import { EmptyState } from '../EmptyState';
import { ProjectList } from '../ProjectList';
import { RecentFileList } from '../RecentFileList';

/** How many recent files the start screen lists (above the PDF import projects); the panel lists all of them. */
const START_SCREEN_RECENT_FILES = 5;

/** No tab open: New, Open and Import PDF, the recent files and the PDF import projects. */
export function StartScreen({ model }: { readonly model: WindowModel }) {
  const { base, files } = model;
  const { palette, t } = base;
  const { recentFiles, documents, pdfImport } = files;
  return (
    <EmptyState
      isLoading={base.workspace.isLoading}
      palette={palette}
      onCreate={documents.create}
      onOpen={documents.openDialog}
      onImportPdf={pdfImport.start}
      recentFiles={
        recentFiles.files.length === 0 ? undefined : (
          <RecentFileList
            files={recentFiles.files}
            palette={palette}
            heading={t('window.start.recentFiles')}
            limit={START_SCREEN_RECENT_FILES}
            onOpen={documents.openRecent}
            onTogglePin={recentFiles.togglePin}
            onRemove={recentFiles.remove}
            onShowAll={recentFiles.openPanel}
          />
        )
      }
      projects={<ProjectList projects={pdfImport.projects} palette={palette} onOpenSong={documents.openPath} onResume={pdfImport.resume} onReveal={pdfImport.reveal} />}
    />
  );
}
