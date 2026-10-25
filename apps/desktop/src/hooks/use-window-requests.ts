import { useEffect } from 'react';
import { subscribeFocusRequests, subscribeHelpRequests, subscribeLyricsRequests, subscribeScalesRequests, subscribeSongWriterRequests } from '../native/gp-files';
import type { WindowBase, WindowMedia } from './use-window';
import type { WindowTools } from './use-window-tools';

/** Help ▸ Keyboard Shortcuts, View ▸ Focus / Unfocus (⇧⌘F: only the score and the transport), Edit ▸ AI Wizard ▸ Song Writer…, Tools ▸ Scales… and Edit ▸ Lyrics…. */
function useMenuRequests({ chrome }: WindowBase, tools: WindowTools): void {
  const { openShortcutSheet, toggleFocus } = chrome;
  useEffect(() => subscribeHelpRequests(openShortcutSheet), [openShortcutSheet]);
  useEffect(() => subscribeFocusRequests(toggleFocus), [toggleFocus]);
  const { open: openSongWriter } = tools.songWriter;
  useEffect(() => subscribeSongWriterRequests(openSongWriter), [openSongWriter]);
  const { open: openScales } = tools.scales;
  useEffect(() => subscribeScalesRequests(openScales), [openScales]);
  const { openLyrics } = tools;
  useEffect(() => subscribeLyricsRequests(openLyrics), [openLyrics]);
}

/**
 * Another tab: playback stops (the player plays the shown song), the instrument picker and the chord panel of the last
 * tab's beat close and the keyboard goes to its score.
 */
function useTabSwitch({ workspace, chrome, focusScore }: WindowBase, { playback }: WindowMedia): void {
  const { stop: stopPlayback } = playback;
  const { closePicker, closeChordPanel } = chrome;
  const { activeTabId } = workspace;
  useEffect(() => {
    stopPlayback();
    closePicker();
    closeChordPanel();
    if (activeTabId !== undefined) {
      focusScore();
    }
  }, [activeTabId, stopPlayback, closePicker, closeChordPanel, focusScore]);
}

/** The menus' requests the window answers itself, and what follows a tab switch. */
export function useWindowRequests(base: WindowBase, media: WindowMedia, tools: WindowTools): void {
  useMenuRequests(base, tools);
  useTabSwitch(base, media);
}
