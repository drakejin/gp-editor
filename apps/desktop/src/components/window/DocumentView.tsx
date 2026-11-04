import type { ReactNode } from 'react';
import { useStableCallback } from '../../hooks/use-stable-callback';
import type { WindowModel } from '../../hooks/use-window';
import type { RowHit } from '../../score/hit-test';
import type { OpenDocument } from '../../state/editor';
import { DocumentLayout } from '../DocumentLayout';
import { Inspector } from '../inspector/Inspector';
import { EditionPalette } from '../palette/EditionPalette';
import { ScalesPanel } from '../scales/ScalesPanel';
import { ScoreView } from '../ScoreView';
import { SongHeader } from '../SongHeader';
import { DocumentBottom } from './DocumentBottom';
import { StartScreen } from './StartScreen';

export interface DocumentPartProps {
  readonly model: WindowModel;
  /** The shown tab's document. */
  readonly document: OpenDocument;
}

interface DocumentViewProps {
  readonly model: WindowModel;
  /** The hint, the panels and the banners under the tab strip: over the score, beside the palette (DocumentLayout). */
  readonly top?: ReactNode;
}

/**
 * Under the tab strip: the shown tab in Guitar Pro 8's layout — the edition palette, the score, the inspector (or the
 * scales) and the panels under them —, or the start screen when no tab is open; `top` over either, in one place, so
 * what it holds (a key being typed) stays when the first tab opens or the last one closes.
 */
export function DocumentView({ model, top }: DocumentViewProps) {
  const { document } = model.base.state;
  if (document === undefined) {
    return <DocumentLayout top={top} center={<StartScreen model={model} />} />;
  }
  return (
    <DocumentLayout
      top={top}
      left={<DocumentPalette model={model} document={document} />}
      // A page of its own per tab: it opens at the tab's cursor, not where the last tab was scrolled.
      center={<DocumentScore key={model.base.workspace.activeTabId} model={model} document={document} />}
      right={<DocumentSide model={model} document={document} />}
      bottom={<DocumentBottom model={model} document={document} />}
    />
  );
}

/** The edition palette, when shown. */
function DocumentPalette({ model, document }: DocumentPartProps) {
  const { base, tools, cursorTools, commands } = model;
  const { palette, state, chrome } = base;
  if (!chrome.panels.palette) {
    return null;
  }
  const { commandPalette } = tools;
  return (
    <EditionPalette
      palette={palette}
      song={document.song}
      cursor={state.cursor}
      isMultivoice={state.isMultivoice}
      isDesignMode={state.isDesignMode}
      hasSelection={state.selectionAnchor !== undefined}
      onEdit={cursorTools.editAtCursor}
      onAction={cursorTools.actAtCursor}
      onOpenPanel={cursorTools.openNotePanel}
      onOpenChordPanel={cursorTools.openChordPanel}
      onOpenExpressionText={tools.openExpressionText}
      onOpenAnnotationPanel={tools.openAnnotations}
      onOpenLyrics={tools.openLyrics}
      onCommand={commands.editor.runCommand}
      isExpressionTextOpen={commandPalette.isOpen && commandPalette.session.initialQuery !== ''}
    />
  );
}

/** The score page, showing a note being dragged up or down, or a bend or tremolo bar panel's draft until it is applied. */
function DocumentScore({ model, document }: DocumentPartProps) {
  const { base, media, tools, cursorTools, commands } = model;
  const { palette, state, chrome, dispatch } = base;
  const { trackIndex } = state;
  const { pitchDrag } = commands.editor;
  // A right-click or ⌃-click on a beat: the cursor goes there and the annotation panel opens (it follows the cursor).
  const onContextBeat = useStableCallback((hit: RowHit) => {
    commands.editor.onPressBeat(hit, false);
    tools.openAnnotations();
  });
  return (
    <ScoreView
      song={pitchDrag.song ?? tools.draftPreview.song ?? document.song}
      trackIndex={trackIndex}
      staves={media.trackView.staves}
      chordDisplay={state.chordDisplay}
      cursor={state.cursor}
      isMultivoice={state.isMultivoice}
      playing={media.playback.playing}
      playingTracks={media.playback.playingTracks}
      selection={cursorTools.selection}
      palette={palette}
      zoom={chrome.zoom}
      onShownZoom={chrome.showZoom}
      header={<SongHeader song={document.song} trackIndex={trackIndex} fileName={document.fileName} palette={palette} />}
      onPressBeat={commands.editor.onPressBeat}
      onDragBeat={commands.editor.onDragBeat}
      onContextBeat={onContextBeat}
      onPressNote={pitchDrag.onPressNote}
      onDragNote={pitchDrag.onDragNote}
      onEndNote={pitchDrag.onEndNote}
      isDesignMode={state.isDesignMode}
      onLayoutEdit={dispatch}
    />
  );
}

/** Beside the score: Tools ▸ Scales… in the inspector's place, else the inspector when shown. */
function DocumentSide({ model, document }: DocumentPartProps) {
  const { base, media, tools, cursorTools, panelCommands } = model;
  const { palette, state, chrome } = base;
  const { scales } = tools;
  if (scales.isOpen) {
    return (
      <ScalesPanel
        palette={palette}
        song={document.song}
        trackIndex={state.trackIndex}
        selection={cursorTools.selection}
        cursorMeasureIndex={state.cursor?.measureIndex ?? 0}
        choice={scales.choice}
        onChoose={scales.choose}
        onClear={scales.clear}
        onClose={scales.close}
      />
    );
  }
  if (!chrome.panels.inspector) {
    return null;
  }
  const { sound, trackView } = media;
  return (
    <Inspector
      palette={palette}
      song={document.song}
      trackIndex={state.trackIndex}
      mode={trackView.selectedMode}
      notice={state.notice}
      soundBanks={sound.soundBanks}
      chordDisplay={state.chordDisplay}
      {...panelCommands.inspector}
      onEditInstrument={chrome.pickInstrument}
      onOpenTrackInfo={tools.trackInfo.open}
      onSelectSoundBank={sound.select}
      onAddSoundBank={sound.add}
      onRemoveSoundBank={sound.remove}
      onSetTrackEffects={panelCommands.effects.onSetTrackEffects}
      onPreviewMix={tools.audio.previewMix}
      midiInput={cursorTools.midiInput}
      note={cursorTools.cursorNote}
      onEditNote={cursorTools.editAtCursor}
      drumKey={tools.drumKey}
      onOpenLyrics={tools.openLyrics}
    />
  );
}
