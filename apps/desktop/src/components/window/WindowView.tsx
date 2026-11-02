import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { WindowModel } from '../../hooks/use-window';
import { HANDLED_KEYS } from '../../lib/key-commands';
import { HintBar } from '../HintBar';
import { ImportBanner } from '../ImportBanner';
import { TabStrip } from '../TabStrip';
import { KeyboardHomeContext } from '../TextField';
import { ErrorBanner } from '../WindowOverlays';
import { DocumentView } from './DocumentView';
import { EditPanels, FilePanels } from './WindowPanels';
import { MenuOverlays, ToolOverlays, WindowDialogs } from './WindowOverlayPanels';
import { WindowTopBar } from './WindowTopBar';

interface WindowViewProps {
  readonly model: WindowModel;
}

/**
 * Guitar Pro 8's window: the top bar, the tabs, the shown tab's document (or the start screen) with the hint strip, the
 * panels and the banners over it, then what opens over it, the last one on top. Its root view takes the score's keys
 * and file drops, and the keyboard back from a field that goes away with it (its panel closed).
 */
export function WindowView({ model }: WindowViewProps) {
  const { base, commands } = model;
  const { palette, keyboardView, setWindowWidth, focusScore } = base;
  return (
    <KeyboardHomeContext.Provider value={focusScore}>
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
        <WindowTabs model={model} />
        <DocumentView model={model} top={<UnderTabStrip model={model} />} />
        <MenuOverlays model={model} />
        <ToolOverlays model={model} />
        <WindowDialogs model={model} />
      </View>
    </KeyboardHomeContext.Provider>
  );
}

/** The open documents' tabs. */
function WindowTabs({ model }: WindowViewProps) {
  const { base, files } = model;
  const { palette, workspace } = base;
  return workspace.tabs.length > 0 ? <TabStrip palette={palette} tabs={files.tabLabels} activeTabId={workspace.activeTabId} onSelect={files.tabs.switchTo} onClose={files.tabs.requestClose} /> : null;
}

/**
 * Under the tab strip: why the last edit did nothing (or what it did), the panels, the PDF import's progress and the
 * error banner. Over the score beside the edition palette while a tab is shown, so they never take its height (a 26-point
 * hint put ONLINE TOOLS below the 1280 × 800 window); across the window over the start screen.
 */
function UnderTabStrip({ model }: WindowViewProps) {
  const { base, panelCommands } = model;
  const { palette, state } = base;
  return (
    <>
      {state.hint !== undefined ? <HintBar palette={palette} message={state.hint} onDismiss={panelCommands.dismissHint} /> : null}
      <FilePanels model={model} />
      <EditPanels model={model} />
      <WindowBanners model={model} />
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
