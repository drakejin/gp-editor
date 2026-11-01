import { DEFAULT_CHANNEL, type Song, suggestTunings } from '@gp-editor/core';
import { neckTitle } from '../src/lib/tuning-hint';
import { shownTrackIcon } from '../src/score/track-icons';
import { type EditorState, INITIAL_EDITOR_STATE, editorReducer } from '../src/state/editor';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

/** "Lead", a steel guitar playing E2 then E4, the cursor on string 6. */
function openGuitar(): EditorState {
  const song = onStrings(makeSong([[beat(960, [note(6, 0)]), beat(1920, [note(1, 0)])]]), [64, 59, 55, 50, 45, 40], { program: 25 });
  const named: Song = { ...song, tracks: song.tracks.map((track) => ({ ...track, name: 'Lead' })) };
  const loaded = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'a.gp5', path: '/a.gp5', song: named } });
  return editorReducer(loaded, { type: 'placeCursor', cursor: { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 6 } });
}

const track = (state: EditorState) => state.document!.song.tracks[0]!;
const program = (state: EditorState) => state.document!.song.channels.find((channel) => channel.id === track(state).channelId)?.program;

describe('the instrument picker’s choice (editor action setTrackInstrument)', () => {
  it('makes a guitar track a 4-string bass in one undo step, the cursor kept on its strings and the hint saying so', () => {
    // Act
    const bass = editorReducer(openGuitar(), { type: 'setTrackInstrument', trackIndex: 0, instrument: 33 });

    // Assert
    expect(track(bass).strings).toHaveLength(4);
    expect(program(bass)).toBe(33);
    expect(bass.cursor?.string).toBe(4);
    expect(bass.past).toHaveLength(1);
    expect(bass.hint).toBe('“Lead” is now a bass track: 4 strings, E A D G.');
    expect(track(editorReducer(bass, { type: 'undo' })).strings).toHaveLength(6);
  });

  it('has the tracks panel’s icon, the tuning menu and the fretboard follow: a bass, its four strings and presets', () => {
    // Act
    const song = editorReducer(openGuitar(), { type: 'setTrackInstrument', trackIndex: 0, instrument: 33 }).document!.song;

    // Assert
    const advice = suggestTunings(song, 0)!;
    expect(shownTrackIcon(song, 0)).toBe('bass');
    expect(advice.instrument).toBe('bass');
    expect(neckTitle(advice, song.tracks[0]!)).toBe('Bass · 4 strings · Standard (E A D G)');
  });

  it('changes only the sound when the track is to stay as it is', () => {
    const sound = editorReducer(openGuitar(), { type: 'setTrackInstrument', trackIndex: 0, instrument: 33, keepsTrack: true });
    expect(track(sound).strings).toHaveLength(6);
    expect(program(sound)).toBe(33);
    expect(sound.hint).toBeUndefined();
  });

  it('shows a track made drums as notation only, as Add Track shows a drum track, and a drum track made pitched as the score does', () => {
    // Act
    const drums = editorReducer(openGuitar(), { type: 'setTrackInstrument', trackIndex: 0, instrument: 'drums' });
    const bass = editorReducer(drums, { type: 'setTrackInstrument', trackIndex: 0, instrument: 33 });

    // Assert
    expect(track(drums).isPercussion).toBe(true);
    expect(drums.trackDisplay.trackModes[0]).toBe('notation');
    expect(drums.hint).toBe('“Lead” is now a drum track. 2 notes taken out: drums and pitched instruments cannot play each other’s notes.');
    expect(bass.trackDisplay.trackModes[0]).toBe('notationAndTab');
  });

  it('changes nothing for a track the song does not have', () => {
    const opened = openGuitar();
    expect(editorReducer(opened, { type: 'setTrackInstrument', trackIndex: 3, instrument: 33 })).toBe(opened);
  });

  it('keeps a drum track’s kit as it is for the drum kit', () => {
    const song = onStrings(makeSong([[beat(960, [note(1, 36)])]]), [0, 0, 0, 0, 0, 0], { isPercussion: true });
    const kit = { ...song, channels: [{ ...DEFAULT_CHANNEL, id: 1, program: 0, bank: 128, isPercussion: true }] };
    const opened = editorReducer(INITIAL_EDITOR_STATE, { type: 'loaded', document: { fileName: 'k.gp5', path: '/k.gp5', song: kit } });
    expect(editorReducer(opened, { type: 'setTrackInstrument', trackIndex: 0, instrument: 'drums' })).toBe(opened);
  });
});
