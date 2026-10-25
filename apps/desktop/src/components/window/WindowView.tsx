import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { WindowModel } from '../../hooks/use-window';
import { HANDLED_KEYS } from '../../lib/key-commands';
import { HintBar } from '../HintBar';
import { ImportBanner } from '../ImportBanner';
import { TabStrip } from '../TabStrip';
import { ErrorBanner } from '../WindowOverlays';
import { DocumentView } from './DocumentView';
import { StartScreen } from './StartScreen';
import { EditPanels, FilePanels } from './WindowPanels';
import { MenuOverlays, ToolOverlays, WindowDialogs } from './WindowOverlayPanels';
import { WindowTopBar } from './WindowTopBar';

interface WindowViewProps {
  readonly model: WindowModel;
}

/**
 * Guitar Pro 8's window: the top bar, the tabs and the hint strip, the panels under them, the shown tab's document (or
 * the start screen), then what opens over it, the last one on top. Its root view takes the score's keys and file drops.
 */
export function WindowView({ model }: WindowViewProps) {
  const { base, commands } = model;
  const { palette, state, keyboardView, setWindowWidth } = base;
  return (
    <View
      ref={keyboardView}
      style={[styles.root, { backgroundColor: palette.chrome }]}
      focusable
      enableFocusRing={false}
      keyDownEvents={HANDLED_KEYS}
      onKeyDown={commands.editor.onKeyDown}
      draggedTypes={['fileUrl']}
      onDrop={commands.editor.onDrop}
      onLayout={(event: LayoutChangeEvent) => setWindowWidth(event.nativeEvent.layout.width)}
    >
      <WindowTopBar model={model} />
      <WindowStrips model={model} />
      <FilePanels model={model} />
      <EditPanels model={model} />
      <WindowBanners model={model} />
      {state.document !== undefined ? <DocumentView model={model} document={state.document} /> : <StartScreen model={model} />}
      <MenuOverlays model={model} />
      <ToolOverlays model={model} />
      <WindowDialogs model={model} />
    </View>
  );
}

/** The open documents' tabs, and why the last edit did nothing. */
function WindowStrips({ model }: WindowViewProps) {
  const { base, files, panelCommands } = model;
  const { palette, workspace, state } = base;
  return (
    <>
      {workspace.tabs.length > 0 ? <TabStrip palette={palette} tabs={files.tabLabels} activeTabId={workspace.activeTabId} onSelect={files.tabs.switchTo} onClose={files.tabs.requestClose} /> : null}
      {state.hint !== undefined ? <HintBar palette={palette} message={state.hint} onDismiss={panelCommands.dismissHint} /> : null}
    </>
  );
}

/** The PDF import's progress, and the error banner: the shown tab's, the window's, playback's, the sound bank's or the recent files'. */
function WindowBanners({ model }: WindowViewProps) {
  const { base, media, files } = model;
  const { state, workspace, dispatch, t } = base;
  const { playback, sound } = media;
  const { recentFiles } = files;
  const errorText =
    state.error ??
    workspace.error ??
    (playback.error !== undefined ? t('window.error.couldNotPlay', { detail: playback.error }) : sound.error !== undefined ? t('window.error.soundBank', { detail: sound.error }) : undefined) ??
    (recentFiles.error !== undefined ? t('window.error.recentFiles', { detail: recentFiles.error }) : undefined);
  const dismissError = () => {
    dispatch({ type: 'dismissError' });
    playback.dismissError();
    sound.dismissError();
    recentFiles.dismissError();
  };
  return (
    <>
      <ImportBanner palette={base.chromePalette} pdfImport={files.pdfImport} onOpenSettings={files.importPanel.open} />
      {errorText !== undefined ? <ErrorBanner message={errorText} onDismiss={dismissError} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
