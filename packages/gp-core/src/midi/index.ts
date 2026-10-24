// Public surface of the MIDI playback module: render a song, map playback time back to the score, and the MIDI
// channels each song channel plays on (for live program changes while a song plays); the metronome's beats and keys.
export { type MidiOptions, type MidiRender, renderMidi } from './render-midi';
export { entrySecondsAt, positionAt, type ScorePosition, type TimelineEntry, type TimelineTempo, timelineIndexAt } from './timeline';
export type { AudioRun } from './audio-sync';
export { type ChannelRoute, UNROUTED, buildChannelRoutes } from './channel-routes';
export { CLICK_KEYS, type ClickOptions, type MeterBeats, meterBeats } from './metronome';
