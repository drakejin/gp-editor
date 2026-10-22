// Public surface of the MIDI playback module: render a song, map playback time back to the score, and the MIDI
// channels each song channel plays on (for live program changes while a song plays).
export { type MidiOptions, type MidiRender, renderMidi } from './render-midi';
export { positionAt, type ScorePosition, type TimelineEntry, timelineIndexAt } from './timeline';
export { type ChannelRoute, UNROUTED, buildChannelRoutes } from './channel-routes';
