import { AudioTrackLane } from '../audio-track/AudioTrackLane';
import { MixerPanel } from '../effects/MixerPanel';
import { InstrumentView } from '../InstrumentView';
import { TracksPanel } from '../TracksPanel';
import type { DocumentPartProps } from './DocumentView';

/** Under the score and the inspector: the piano keyboard and fretboard (a drum kit for drums), the tracks, the audio track's lane and the mixer. */
export function DocumentBottom({ model, document }: DocumentPartProps) {
  const { base, media, tools, cursorTools } = model;
  const { palette, state, chrome } = base;
  const { playback } = media;
  return (
    <>
      <InstrumentView
        song={document.song}
        trackIndex={state.trackIndex}
        cursor={state.cursor}
        playing={playback.playing}
        palette={palette}
        showsKeyboard={chrome.panels.keyboard}
        showsFretboard={chrome.panels.neck}
        scale={tools.scales.highlight}
        onDrumHit={cursorTools.hitDrum}
        onHoverPitch={media.previewPitch}
        drumKey={tools.drumKey}
      />
      {chrome.panels.tracks ? <DocumentTracks model={model} document={document} /> : null}
      <DocumentMixer model={model} document={document} />
    </>
  );
}

/** The tracks panel with its bar map, and the audio track's lane under it. */
function DocumentTracks({ model, document }: DocumentPartProps) {
  const { base, media, tools, cursorTools, panelCommands } = model;
  const { palette, state, chrome } = base;
  const { trackView, playback } = media;
  const { audioLane } = cursorTools;
  const { track } = panelCommands;
  const { audioTrack } = document.song;
  return (
    <>
      <TracksPanel
        song={document.song}
        selectedTrackIndex={state.trackIndex}
        shownTrackIndexes={trackView.shownTrackIndexes}
        isMultitrack={trackView.isMultitrack}
        onToggleMultitrack={trackView.toggleMultitrack}
        onToggleTrackShown={trackView.toggleTrackShown}
        cursorMeasureIndex={state.cursor?.measureIndex}
        playingMeasureIndex={playback.playing?.measureIndex}
        palette={palette}
        onEditInstrument={chrome.pickInstrument}
        onAddAudioTrack={audioTrack === undefined ? audioLane.addAudioTrack : undefined}
        trackActions={tools.trackManager.panelActions}
        {...track}
      />
      {audioTrack !== undefined ? (
        <AudioTrackLane
          song={document.song}
          audioTrack={audioTrack}
          lane={audioLane}
          cursorMeasureIndex={state.cursor?.measureIndex}
          playingSeconds={playback.audioSeconds}
          palette={palette}
          onSelectBar={(measureIndex) => track.onSelectBar(state.trackIndex, measureIndex)}
        />
      ) : null}
    </>
  );
}

/** View ▸ Mixer: the tracks' strips and the master. */
function DocumentMixer({ model, document }: DocumentPartProps) {
  const { base, tools, cursorTools, panelCommands } = model;
  const { chrome } = base;
  if (!chrome.panels.mixer) {
    return null;
  }
  return (
    <MixerPanel
      palette={base.palette}
      song={document.song}
      selectedTrackIndex={base.state.trackIndex}
      onSelectTrack={panelCommands.track.onSelectTrack}
      {...panelCommands.effects}
      onSetAudioTrackMix={cursorTools.audioLane.setMix}
      onPreview={tools.audio.previewMix}
      onClose={() => chrome.togglePanel('mixer')}
    />
  );
}
