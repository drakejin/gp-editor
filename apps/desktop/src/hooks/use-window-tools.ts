import { useCallback, useEffect, useMemo } from 'react';
import type { Song, TrackIndexMap } from '@gp-editor/core';
import { subscribeTunerRequests } from '../native/audio-input';
import { describeReference } from '../song-writer/reference';
import { type SettingsPanelState, useSettingsPanel } from './use-app-settings';
import { type AudioTools, useAudioTools } from './use-audio-tools';
import { type CommandPalette, type TransposePanel, useCommandPalette, useTransposePanel } from './use-command-palette';
import { type DraftPreview, useDraftPreview } from './use-draft-preview';
import { type DrumKey, useDrumKey } from './use-drum-key';
import { type AnnotationEditor, useAnnotationEditor } from './use-annotation-editor';
import { type LyricsEditor, useLyricsEditor } from './use-lyrics-editor';
import { type ScalesTool, useScales } from './use-scales';
import { type ScoreDesign, useScoreDesign } from './use-score-design';
import { type SongWriter, useSongWriter, writtenSummary } from './use-song-writer';
import { type TrackInfo, useTrackInfo } from './use-track-info';
import { type TrackManager, useTrackManager } from './use-track-manager';
import { useStableCallback } from './use-stable-callback';
import { type Tuner, useTuner } from './use-tuner';
import type { WindowBase } from './use-window';

/** The tools and panels of the window's menus: what each one shows and does. */
export interface WindowTools {
  /** The bend and tremolo bar panels' draft, shown on the score until Apply makes it an edit. */
  readonly draftPreview: DraftPreview;
  /** Edit ▸ AI Wizard ▸ Song Writer…. */
  readonly songWriter: SongWriter;
  /** Tools ▸ Scales… (beside the score, in the inspector's place). */
  readonly scales: ScalesTool;
  /** The open score as the Song Writer's reference (its first bars with notes as text). */
  readonly reference?: string;
  /** Edit ▸ Lyrics… (above the score). */
  readonly lyricsEditor: LyricsEditor;
  /** Opens the lyrics panel on the shown song (the same function after every edit, for the menu's listener). */
  readonly openLyrics: () => void;
  /** Closes the lyrics panel; the keyboard goes back to the score as its field goes away. */
  readonly closeLyricsPanel: () => void;
  /** Edit ▸ Annotation… (J, the palette's ✎): the cursor's beat's annotation, above the score. */
  readonly annotationEditor: AnnotationEditor;
  /** Opens the annotation panel on the cursor's beat (the same function after every edit, for the menu's listener). */
  readonly openAnnotations: () => void;
  /** Writes what was typed and closes the annotation panel; the keyboard goes back to the score. */
  readonly closeAnnotationPanel: () => void;
  /** Tools ▸ Tuner…: the microphone runs while its panel is open. */
  readonly tuner: Tuner;
  /** GP Editor ▸ Settings… (⌘,): language, interface contrast, score paper. */
  readonly settingsPanel: SettingsPanelState;
  /** Tools ▸ Transpose…. */
  readonly transposePanel: TransposePanel;
  /** Tools ▸ Command Palette… (⇧⌘P) and Expression Text… (⌥⌘E). */
  readonly commandPalette: CommandPalette;
  readonly openExpressionText: () => void;
  /** File ▸ Stylesheet… (F7), View ▸ Design Mode, View ▸ Reset Positions. */
  readonly scoreDesign: ScoreDesign;
  /** Effects (View ▸ Mixer, the Track inspector) heard live, and Tools ▸ Line In… (a card beside the score). */
  readonly audio: AudioTools;
  /** Track ▸ Add Track…, Duplicate, Delete, Move Up / Down. */
  readonly trackManager: TrackManager;
  /** View ▸ Drum Key: how the cursor's drum track writes its drums, a card over the score. */
  readonly drumKey: DrumKey;
  /** A track's name, short name, colour and icon (Guitar Pro 8's track information), a small panel over the window. */
  readonly trackInfo: TrackInfo;
}

/** Edit ▸ AI Wizard ▸ Song Writer…: a written song opens in a new tab, unsaved, with a summary in the hint strip. */
function useWindowSongWriter({ dispatch }: WindowBase): SongWriter {
  const onSongWritten = useCallback(
    (written: Song, fileName: string, warnings: readonly string[]) => {
      dispatch({ type: 'openTab', document: { fileName, path: '', song: written }, isUnsaved: true });
      dispatch({ type: 'showHint', hint: writtenSummary(written, warnings) });
    },
    [dispatch],
  );
  return useSongWriter(onSongWritten);
}

/** The panels beside and over the score: scales, lyrics, tuner, settings, transpose, the command palette, the stylesheet, the drum key. */
function useWindowPanels(base: WindowBase) {
  const { workspace, dispatch, state, focusScore } = base;
  const song = state.document?.song;
  const hasDocument = state.document !== undefined;
  const scales = useScales();
  const lyricsEditor = useLyricsEditor(song, state.trackIndex, workspace.activeTabId, dispatch);
  const { close: closeLyrics } = lyricsEditor;
  // The lyrics editor opens on the shown song, so its `open` changes with every edit: the menu calls the latest.
  const openLyrics = useStableCallback(() => lyricsEditor.open());
  const closeLyricsPanel = useCallback(() => {
    closeLyrics();
    focusScore();
  }, [closeLyrics, focusScore]);
  const annotationEditor = useAnnotationEditor(song, state.cursor, workspace.activeTabId, dispatch);
  const openAnnotations = useStableCallback(() => annotationEditor.open());
  const closeAnnotationPanel = useStableCallback(() => {
    annotationEditor.close();
    focusScore();
  });
  const tuner = useTuner();
  const { open: openTuner } = tuner;
  useEffect(() => subscribeTunerRequests(openTuner), [openTuner]);
  const settingsPanel = useSettingsPanel();
  // The keyboard goes back to the score when the transpose panel and the command palette close.
  const transposePanel = useTransposePanel(hasDocument);
  const commandPalette = useCommandPalette(focusScore);
  const { open: openCommandPalette } = commandPalette;
  const openExpressionText = useCallback(() => openCommandPalette('expression'), [openCommandPalette]);
  const scoreDesign = useScoreDesign(hasDocument, dispatch, focusScore);
  const drumKey = useDrumKey(focusScore);
  return {
    scales, lyricsEditor, openLyrics, closeLyricsPanel, annotationEditor, openAnnotations, closeAnnotationPanel, tuner, settingsPanel, transposePanel, commandPalette,
    openExpressionText, scoreDesign, drumKey,
  };
}

export function useWindowTools(base: WindowBase): WindowTools {
  const { workspace, dispatch, state, chrome, focusScore } = base;
  const song = state.document?.song;
  const draftPreview = useDraftPreview(song, state.cursor);
  const songWriter = useWindowSongWriter(base);
  const reference = useMemo(() => (song === undefined ? undefined : describeReference(song, state.trackIndex)), [song, state.trackIndex]);
  const panels = useWindowPanels(base);
  const audio = useAudioTools(song, state.trackIndex, chrome.togglePanel);
  const trackInfo = useTrackInfo(focusScore, { tabId: workspace.activeTabId, trackCount: song?.tracks.length ?? 0 });
  // The line in's lock follows track edits; the instrument picker and the track information close.
  const followTracks = (map: TrackIndexMap) => {
    audio.lineIn.remapTrack(map);
    chrome.closePicker();
    trackInfo.close();
  };
  const trackManager = useTrackManager({ song, shownTrackIndex: state.trackIndex, tabId: workspace.activeTabId, dispatch, onClosed: focusScore, onTracksRemapped: followTracks });
  return { draftPreview, songWriter, reference, ...panels, audio, trackManager, trackInfo };
}
