import { stylesheetOf } from '@gp-editor/core';
import type { WindowModel } from '../../hooks/use-window';
import { beatAnnotation } from '../../lib/annotation-draft';
import { selectedFragment, selectionSummary } from '../../state/selection';
import { type TranspositionDraft, noSelectionHint, toTranspositionOptions, transpositionScope } from '../../state/transposition';
import { AudioExportPanel } from '../AudioExportPanel';
import { ExportPanel } from '../ExportPanel';
import { ImportPanel } from '../ImportPanel';
import { AnnotationPanel } from '../annotations/AnnotationPanel';
import { LyricsPanel } from '../lyrics/LyricsPanel';
import { RecentFilesPanel } from '../RecentFilesPanel';
import { DesignModeBar } from '../stylesheet/DesignModeBar';
import { StylesheetPanel } from '../stylesheet/StylesheetPanel';
import { TransposePanel } from '../TransposePanel';

interface WindowPartProps {
  readonly model: WindowModel;
}

/** The PDF import's settings, and the PDF / PNG and audio exports, under the tab strip. */
export function FilePanels({ model }: WindowPartProps) {
  const { base, media, files, tools } = model;
  const { chromePalette, state } = base;
  const { document } = state;
  const { pdfExport, audioExport } = files;
  const { trackView } = media;
  return (
    <>
      <ImportPanelPart model={model} />
      {pdfExport.isOpen && document !== undefined ? (
        <ExportPanel
          palette={chromePalette}
          song={document.song}
          trackIndex={state.trackIndex}
          staves={trackView.staves}
          fileName={document.fileName}
          mode={trackView.selectedMode}
          chordDisplay={state.chordDisplay}
          format={pdfExport.format}
          isSaving={pdfExport.isSaving}
          onSave={pdfExport.save}
          onSavePng={pdfExport.savePng}
          onClose={pdfExport.close}
          onOpenStylesheet={tools.scoreDesign.openStylesheet}
        />
      ) : null}
      {audioExport.isOpen && document !== undefined ? (
        <AudioExportPanel
          palette={chromePalette}
          song={document.song}
          fileName={document.fileName}
          loop={media.playback.practice.loop}
          options={audioExport.options}
          status={audioExport.status}
          onChangeOptions={audioExport.setOptions}
          onExport={audioExport.start}
          onCancel={audioExport.cancel}
          onClose={audioExport.close}
        />
      ) : null}
    </>
  );
}

/** File ▸ Import PDF…'s settings: the API key and the model; Start closes it and imports. */
function ImportPanelPart({ model }: WindowPartProps) {
  const { importPanel, pdfImport } = model.files;
  if (!importPanel.isOpen) {
    return null;
  }
  return (
    <ImportPanel
      palette={model.base.chromePalette}
      hasKey={pdfImport.hasKey}
      model={pdfImport.model}
      onSaveKey={pdfImport.saveKey}
      onRemoveKey={pdfImport.removeKey}
      onChooseModel={pdfImport.chooseModel}
      onStart={() => {
        importPanel.close();
        pdfImport.start();
      }}
      onClose={importPanel.close}
    />
  );
}

/** Tools ▸ Transpose…: the panel's choice, transposed in one undo step (a hint when the selection it needs is missing). */
function transposeTo({ base, tools }: WindowModel, draft: TranspositionDraft): void {
  const { state, dispatch, focusScore } = base;
  const scope = transpositionScope(state, draft.target);
  dispatch(scope === undefined ? { type: 'showHint', hint: noSelectionHint() } : { type: 'transpose', scope, options: toTranspositionOptions(draft) });
  tools.transposePanel.close();
  focusScore();
}

/** Transpose, the stylesheet and Design Mode's strip, the recent files, the lyrics and the annotation, under the tab strip. */
export function EditPanels({ model }: WindowPartProps) {
  const { base, tools, cursorTools } = model;
  const { palette, chromePalette, state, dispatch, focusScore } = base;
  const { document } = state;
  const { transposePanel, scoreDesign, lyricsEditor } = tools;
  const selection = transposePanel.isOpen && state.selectionAnchor !== undefined ? selectedFragment(state) : undefined;
  return (
    <>
      {transposePanel.isOpen ? (
        <TransposePanel
          palette={chromePalette}
          trackName={document?.song.tracks[state.trackIndex]?.name ?? ''}
          selection={selection === undefined ? undefined : selectionSummary(state, selection)}
          onTranspose={(draft) => transposeTo(model, draft)}
          onClose={() => {
            transposePanel.close();
            focusScore();
          }}
        />
      ) : null}
      {scoreDesign.isStylesheetOpen && document !== undefined ? (
        <StylesheetPanel palette={chromePalette} sheet={stylesheetOf(document.song)} onChange={(stylesheet) => dispatch({ type: 'setStylesheet', stylesheet })} onClose={scoreDesign.closeStylesheet} />
      ) : null}
      {state.isDesignMode === true && document !== undefined ? <DesignModeBar palette={chromePalette} song={document.song} cursorMeasureIndex={state.cursor?.measureIndex} onAction={cursorTools.actAtCursor} /> : null}
      <RecentFilesPanelPart model={model} />
      {lyricsEditor.draft !== undefined && document !== undefined ? (
        <LyricsPanel
          palette={palette}
          song={document.song}
          draft={lyricsEditor.draft}
          onChooseTrack={lyricsEditor.chooseTrack}
          onChangeFrom={lyricsEditor.changeFrom}
          onChangeText={lyricsEditor.changeText}
          onClose={tools.closeLyricsPanel}
        />
      ) : null}
      <AnnotationPanelPart model={model} />
    </>
  );
}

/** Edit ▸ Annotation… (J): the cursor's beat's annotation. */
function AnnotationPanelPart({ model }: WindowPartProps) {
  const { base, tools } = model;
  const { annotationEditor: editor } = tools;
  const song = base.state.document?.song;
  if (editor.draft === undefined || song === undefined) {
    return null;
  }
  return (
    <AnnotationPanel
      palette={base.palette}
      draft={editor.draft}
      hasAnnotation={beatAnnotation(song, editor.draft.at) !== undefined}
      movable={editor.movable}
      onChangeText={editor.changeText}
      onChangePlacement={editor.changePlacement}
      onApply={editor.apply}
      onDelete={editor.remove}
      onMoveHere={editor.moveHere}
      onClose={tools.closeAnnotationPanel}
    />
  );
}

/** File ▸ Recent Files…: the whole list, pinned files first. */
function RecentFilesPanelPart({ model }: WindowPartProps) {
  const { recentFiles, documents } = model.files;
  if (!recentFiles.isPanelOpen) {
    return null;
  }
  return (
    <RecentFilesPanel
      palette={model.base.chromePalette}
      files={recentFiles.files}
      onOpen={(path) => {
        recentFiles.closePanel();
        documents.openRecent(path);
      }}
      onTogglePin={recentFiles.togglePin}
      onRemove={recentFiles.remove}
      onClear={recentFiles.clear}
      onClose={recentFiles.closePanel}
    />
  );
}
