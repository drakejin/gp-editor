// The instruments a song plays on. Tracks without effects share one multitimbral MIDISynth with the whole sound bank
// loaded (as before effects existed, so they sound the same). A track with effects plays through its strip
// (GPMixGraph), so it needs instruments of its own: an AVAudioUnitSampler per MIDI channel it uses, loaded with that
// channel's program from the same bank. A sampler answers every MIDI channel, so the sequence track's events are split
// by channel first (the second channel carries bent notes, whose pitch bends must leave the other notes alone).
// Samplers stay loaded between plays while their track's strip, program and bank stay the same.
// Not thread-safe: use it on the queue that owns the engine.

#import <AVFoundation/AVFoundation.h>

#import "GPMixGraph.h"

NS_ASSUME_NONNULL_BEGIN

@interface GPTrackInstruments : NSObject

- (instancetype)initWithEngine:(AVAudioEngine *)engine graph:(GPMixGraph *)graph NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/** The shared synth, with `bankURL` loaded (a new synth when the bank changed; nil: the synth's built-in bank). */
- (BOOL)prepareBank:(nullable NSURL *)bankURL error:(NSError **)error;

/**
 * Points every track of a loaded sequence (gp-core's renderMidi: a conductor track, then one per song track) at its
 * instrument, splitting a strip track by MIDI channel, and loads the programs the song starts with.
 */
- (void)routeSequencer:(AVAudioSequencer *)sequencer;

/** A channel's program now, on the shared synth and on the samplers playing that channel. */
- (void)setProgram:(UInt8)program onChannel:(UInt8)channel;

/** A control change now, on the shared synth and on the samplers playing that channel. */
- (void)setController:(UInt8)controller value:(UInt8)value onChannel:(UInt8)channel;

/** All notes off, on every instrument. */
- (void)silence;

@end

NS_ASSUME_NONNULL_END
