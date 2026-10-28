import { type Dispatch, type RefObject, useCallback, useMemo, useReducer, useRef, useState } from 'react';
import type { View } from 'react-native';
import { focusView } from '../native/focus-view';
import type { EditorState } from '../state/editor';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, activeEditor, workspaceReducer } from '../state/workspace';
import { type Palette, onChrome, usePalette } from '../theme';
import { type CursorTools, useCursorTools } from './use-cursor-tools';
import { type Translate, useT } from './use-i18n';
import { useNotePreview } from './use-note-preview';
import { type Playback, usePlayback } from './use-playback';
import { type SoundBankCommands, useSoundBanks } from './use-sound-banks';
import { type TrackDisplayView, useTrackDisplay } from './use-track-display';
import { type PanelCommands, usePanelCommands } from './use-panel-commands';
import { type TopBarModel, useTopBarModel } from './use-top-bar-model';
import { type WindowChrome, useWindowChrome } from './use-window-chrome';
import { type WindowCommands, useWindowCommands } from './use-window-commands';
import { type WindowFiles, useWindowFiles } from './use-window-files';
import { type WindowOverlays, useWindowOverlays } from './use-window-overlays';
import { useWindowRequests } from './use-window-requests';
import { type WindowTools, useWindowTools } from './use-window-tools';

/** What every part of the window reads: the open documents, the shown tab's editor, the chrome around the score. */
export interface WindowBase {
  readonly palette: Palette;
  /** Panels and banners around the score share Guitar Pro's dark chrome. */
  readonly chromePalette: Palette;
  /** Every open document is a tab. */
  readonly workspace: WorkspaceState;
  /** Editor actions go to the shown tab. */
  readonly dispatch: Dispatch<WorkspaceAction>;
  /** The shown tab's editor. */
  readonly state: EditorState;
  /** Keyboard edits arrive at this view; clicking the score does not make it first responder by itself. */
  readonly keyboardView: RefObject<View | null>;
  /** The keyboard back to the score (after a palette button, when a panel closes). */
  readonly focusScore: () => void;
  readonly chrome: WindowChrome;
  /** The window's words in the shown language (`t` changes with it). */
  readonly t: Translate;
  readonly windowWidth: number;
  readonly setWindowWidth: (width: number) => void;
}

/** What sounds and how the score is shown: the tracks shown, playback, the sound banks, the hover preview. */
export interface WindowMedia {
  /** The tracks the score shows (View ▸ Multitrack, the tracks panel's eyes), each in its own staves. */
  readonly trackView: TrackDisplayView;
  readonly playback: Playback;
  readonly sound: SoundBankCommands;
  /** Preview on hover: a key or fret the mouse enters plays with the shown track's sound. */
  readonly previewPitch?: (pitch: number) => void;
}

/** Everything the window shows and does (useWindow). */
export interface WindowModel {
  readonly base: WindowBase;
  readonly media: WindowMedia;
  readonly files: WindowFiles;
  readonly tools: WindowTools;
  readonly overlays: WindowOverlays;
  readonly cursorTools: CursorTools;
  readonly commands: WindowCommands;
  readonly panelCommands: PanelCommands;
  readonly topBar: TopBarModel;
}

function useWindowBase(): WindowBase {
  const palette = usePalette();
  const chromePalette = useMemo(() => onChrome(palette), [palette]);
  const [workspace, dispatch] = useReducer(workspaceReducer, INITIAL_WORKSPACE);
  const keyboardView = useRef<View>(null);
  const focusScore = useCallback(() => focusView(keyboardView.current), []);
  const chrome = useWindowChrome();
  const [windowWidth, setWindowWidth] = useState(0);
  const t = useT();
  return { palette, chromePalette, workspace, dispatch, state: activeEditor(workspace), keyboardView, focusScore, chrome, t, windowWidth, setWindowWidth };
}

function useWindowMedia({ state, dispatch }: WindowBase): WindowMedia {
  const song = state.document?.song;
  const trackView = useTrackDisplay(state, dispatch);
  const playback = usePlayback(song, state.trackIndex, trackView.shownTrackIndexes);
  const sound = useSoundBanks(playback.restart);
  const previewPitch = useNotePreview(song, state.trackIndex, playback.practice.isPreviewOnHover);
  return { trackView, playback, sound, previewPitch };
}

/** The window, composed from the editor's hooks in the order they depend on each other. */
export function useWindow(): WindowModel {
  const base = useWindowBase();
  const media = useWindowMedia(base);
  const files = useWindowFiles(base, media);
  const tools = useWindowTools(base);
  const overlays = useWindowOverlays(base, files, tools);
  const cursorTools = useCursorTools(base, media, overlays.isOverlayOpen);
  const commands = useWindowCommands({ base, media, files, tools, overlays, cursorTools });
  const panelCommands = usePanelCommands(base);
  const topBar = useTopBarModel(base, media, commands.editor);
  useWindowRequests(base, media, tools);
  return { base, media, files, tools, overlays, cursorTools, commands, panelCommands, topBar };
}
