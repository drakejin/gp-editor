import { stylesheetOf } from '@gp-editor/core';
import { commandStateOf } from '../../hooks/use-command-palette';
import type { WindowModel } from '../../hooks/use-window';
import { commandActionsOf } from '../../hooks/use-window-commands';
import { allCommands } from '../../lib/commands';
import { tunerStrings } from '../../lib/tuner-display';
import { ChordPanel } from '../chords/ChordPanel';
import { ChromeMenu } from '../chrome/ChromeMenu';
import { CommandPalette } from '../CommandPalette';
import { DrumKeyPanel } from '../drum-key/DrumKeyPanel';
import { LineInPanel } from '../effects/LineInPanel';
import { NotePanelView } from '../note-panels/NotePanels';
import { PracticeMenu } from '../PracticeMenu';
import { SaveChangesPanel } from '../SaveChangesPanel';
import { SettingsPanel } from '../settings/SettingsPanel';
import { ShortcutSheet } from '../ShortcutSheet';
import { SongWriterPanel } from '../song-writer/SongWriterPanel';
import { TOP_BAR_HEIGHT } from '../TopBar';
import { SpeedMenu } from '../TopBarMenus';
import { ZoomMenu } from '../ZoomMenu';
import { TrackInfoPanel } from '../track-info/TrackInfoPanel';
import { TrackManagerOverlays } from '../TrackManagerOverlays';
import { TunerPanel } from '../tuner/TunerPanel';
import { PickerOverlay } from '../WindowOverlays';

interface WindowPartProps {
  readonly model: WindowModel;
}

/** A top-bar menu (zoom, speed, practice) under its button, the shortcut sheet and the command palette. */
export function MenuOverlays({ model }: WindowPartProps) {
  const { base, tools } = model;
  const { palette, chrome, focusScore } = base;
  const { commandPalette } = tools;
  return (
    <>
      <TopBarMenu model={model} />
      {chrome.isShortcutSheetOpen ? <ShortcutSheet palette={palette} onClose={chrome.closeShortcutSheet} /> : null}
      {commandPalette.isOpen ? (
        <CommandPalette
          // A fresh field each time it opens: empty, or “>” from Tools ▸ Expression Text….
          key={commandPalette.session.id}
          initialQuery={commandPalette.session.initialQuery}
          palette={palette}
          commands={allCommands()}
          state={commandStateOf(base.workspace)}
          recentIds={commandPalette.recentIds}
          onRun={(command) => commandPalette.run(command, commandActionsOf(model))}
          onClose={() => {
            commandPalette.close();
            focusScore();
          }}
        />
      ) : null}
    </>
  );
}

function TopBarMenu({ model }: WindowPartProps) {
  const { base, media, topBar, tools } = model;
  const { palette, chrome, state, dispatch } = base;
  const { practice, changePractice } = media.playback;
  if (chrome.menu === undefined) {
    return null;
  }
  return (
    <ChromeMenu palette={palette} x={chrome.menu.x} top={TOP_BAR_HEIGHT} windowWidth={base.windowWidth} onClose={chrome.closeMenu}>
      {chrome.menu.id === 'zoom' ? (
        <ZoomMenu
          palette={palette}
          zoom={chrome.zoom}
          onZoom={chrome.setZoom}
          stylesheet={state.document === undefined ? undefined : stylesheetOf(state.document.song)}
          onChangeStylesheet={(stylesheet) => dispatch({ type: 'setStylesheet', stylesheet })}
          onOpenStylesheet={tools.scoreDesign.openStylesheet}
          onClose={chrome.closeMenu}
        />
      ) : null}
      {chrome.menu.id === 'speed' ? (
        <SpeedMenu
          palette={palette}
          practice={practice}
          writtenTempo={topBar.writtenTempo}
          measureCount={topBar.measureCount}
          cursorMeasureIndex={topBar.cursorMeasureIndex}
          onChangePractice={changePractice}
          onClose={chrome.closeMenu}
        />
      ) : null}
      {chrome.menu.id === 'practice' ? <PracticeMenu palette={palette} practice={practice} writtenTempo={topBar.writtenTempo} onChangePractice={changePractice} /> : null}
    </ChromeMenu>
  );
}

/** The Song Writer, the line in's card, the drum key, the tuner, the chord and note panels, the Add Track panel, the delete question and a track's information. */
export function ToolOverlays({ model }: WindowPartProps) {
  const { base, tools, cursorTools } = model;
  const { palette, chromePalette, state, chrome } = base;
  const song = state.document?.song;
  const { cursor } = state;
  const { lineIn } = tools.audio;
  const { leaveChordPanel, cursorNote } = cursorTools;
  return (
    <>
      <SongWriterOverlay model={model} />
      {lineIn.isOpen && song !== undefined ? <LineInPanel palette={palette} lineIn={lineIn} trackLabel={`${lineIn.trackIndex + 1}. ${song.tracks[lineIn.trackIndex]?.name ?? ''}`} /> : null}
      {tools.drumKey.isOpen && song !== undefined ? <DrumKeyPanel palette={palette} song={song} trackIndex={state.trackIndex} drumKey={tools.drumKey} /> : null}
      {tools.tuner.isOpen ? (
        <TunerPanel palette={palette} referenceA4={tools.tuner.referenceA4} strings={tunerStrings(song?.tracks[state.trackIndex])} onShiftReferenceA4={tools.tuner.shiftReferenceA4} onClose={tools.tuner.close} />
      ) : null}
      {chrome.isChordPanelOpen && song !== undefined && cursor !== undefined ? (
        <ChordPanel
          palette={palette}
          song={song}
          cursor={cursor}
          onApply={(chord, withNotes) => leaveChordPanel({ type: 'setBeatChord', chord, withNotes })}
          onRemove={() => leaveChordPanel({ type: 'setBeatChord', chord: undefined })}
          onClose={() => leaveChordPanel()}
        />
      ) : null}
      {chrome.notePanel !== undefined && cursorNote !== undefined ? (
        <NotePanelView palette={palette} panel={chrome.notePanel} note={cursorNote} onEdit={cursorTools.editAtCursor} onPreview={tools.draftPreview.show} onClose={chrome.closeNotePanel} />
      ) : null}
      <TrackManagerOverlays manager={tools.trackManager} palette={chromePalette} />
      <TrackInfoOverlay model={model} />
    </>
  );
}

/** A track's information (name, short name, colour, icon) beside the control that opened it. */
function TrackInfoOverlay({ model }: WindowPartProps) {
  const { base, tools, panelCommands } = model;
  const { trackInfo } = tools;
  const song = base.state.document?.song;
  if (song === undefined || trackInfo.trackIndex === undefined || trackInfo.anchor === undefined) {
    return null;
  }
  return (
    <TrackInfoPanel
      key={trackInfo.trackIndex}
      palette={base.chromePalette}
      song={song}
      trackIndex={trackInfo.trackIndex}
      anchor={trackInfo.anchor}
      windowWidth={base.windowWidth}
      {...panelCommands.inspector}
      onEditInstrument={base.chrome.pickInstrument}
      onClose={trackInfo.close}
    />
  );
}

/** Edit ▸ AI Wizard ▸ Song Writer…, with the open score as its reference. */
function SongWriterOverlay({ model }: WindowPartProps) {
  const { base, files, tools } = model;
  const { songWriter, reference } = tools;
  const { pdfImport } = files;
  const { document } = base.state;
  if (!songWriter.isOpen) {
    return null;
  }
  return (
    <SongWriterPanel
      palette={base.chromePalette}
      draft={songWriter.draft}
      onChangeDraft={songWriter.changeDraft}
      status={songWriter.status}
      reference={reference === undefined || document === undefined ? undefined : `${document.fileName} · ${document.song.tracks[base.state.trackIndex]?.name ?? ''}`}
      hasKey={pdfImport.hasKey}
      model={pdfImport.model}
      onSaveKey={pdfImport.saveKey}
      onChooseModel={pdfImport.chooseModel}
      onWrite={() => songWriter.write(pdfImport.model, reference)}
      onCancel={songWriter.cancel}
      onClose={songWriter.close}
    />
  );
}

/** Settings (over every other panel), the instrument picker and the save question of a tab being closed. */
export function WindowDialogs({ model }: WindowPartProps) {
  const { base, files, tools } = model;
  const { palette, state, chrome, dispatch, focusScore } = base;
  const song = state.document?.song;
  const { settingsPanel } = tools;
  const { tabs } = files;
  return (
    <>
      {settingsPanel.isOpen ? (
        <SettingsPanel
          palette={palette}
          snapshot={settingsPanel.snapshot}
          onChange={settingsPanel.change}
          onClose={() => {
            settingsPanel.close();
            focusScore();
          }}
        />
      ) : null}
      {song !== undefined && chrome.pickingTrackIndex !== undefined ? <PickerOverlay {...{ palette, song, dispatch }} trackIndex={chrome.pickingTrackIndex} onClose={chrome.closePicker} /> : null}
      {tabs.closing !== undefined ? <SaveChangesPanel palette={palette} name={tabs.closing.name} onSave={tabs.saveAndClose} onDiscard={tabs.discardAndClose} onCancel={tabs.cancelClose} /> : null}
    </>
  );
}
