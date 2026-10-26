import type { WindowModel } from '../../hooks/use-window';
import { isEdited } from '../../state/editor';
import { TopBar } from '../TopBar';

/** The top bar of the shown tab: its LCD, history, transport and practice state (TopBar, memoised). */
export function WindowTopBar({ model }: { readonly model: WindowModel }) {
  const { base, media, commands, topBar } = model;
  const { palette, state, chrome } = base;
  const { playback } = media;
  const { practice } = playback;
  return (
    <TopBar
      palette={palette}
      hasDocument={state.document !== undefined}
      canUndo={state.past.length > 0}
      canRedo={state.future.length > 0}
      isPlaying={playback.isPlaying}
      isEdited={isEdited(state)}
      isLooping={practice.isLooping}
      zoom={chrome.zoom}
      speedLabel={topBar.speedLabel}
      lcd={topBar.lcd}
      trackColor={topBar.trackColor}
      trackIcon={topBar.trackIcon}
      panels={chrome.panels}
      onTogglePanel={chrome.togglePanel}
      onOpenMenu={chrome.openMenu}
      onToggleLoop={topBar.toggleLoop}
      beat={playback.beat}
      onSetTempo={topBar.setPlaybackTempo}
      isMetronomeOn={practice.isMetronomeOn}
      isCountInOn={practice.isCountInOn}
      onTogglePractice={topBar.togglePractice}
      onShiftSpeed={topBar.shiftSpeed}
      onShowShortcuts={chrome.openShortcutSheet}
      onCommand={commands.editor.runCommand}
    />
  );
}
