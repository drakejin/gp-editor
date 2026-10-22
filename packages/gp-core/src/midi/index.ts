// Public surface of the MIDI playback module: render a song, map playback time back to the score.
export { type MidiOptions, type MidiRender, renderMidi } from './render-midi';
export { positionAt, type ScorePosition, type TimelineEntry } from './timeline';
