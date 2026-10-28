// Plays Standard MIDI Files through one AVAudioEngine in real time: the mix (GPMixGraph — track strips with their
// effects, the master strip), the instruments (GPTrackInstruments — a shared MIDISynth that loads the sound bank once,
// again only when the selected bank changes, and samplers for tracks with effects), an AVAudioSequencer per song, and
// the line in (GPLineIn). Once the bank is loaded, starting playback costs a sequence load (milliseconds); a channel's
// program, volume and pan, and every effect value, change while the song plays. Adding, removing or reordering effects
// rewires the graph, which stops the sequencer: it starts again where it was. MIDISynth keeps the whole bank in memory
// (about 220 MB for GeneralUser GS, 30 MB for the macOS bank), so the engine is released a minute after playback stops
// (at once when the line in had opened an input, so the microphone is let go); the first play after that, or after
// another bank is chosen, loads the bank again (about 250 ms for GeneralUser GS). GPMixRenderer builds the same graph
// on an engine in manual rendering mode, for offline renders.
// Not thread-safe: every method runs on the queue given at init, which is also where the idle release runs.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPMidiEngine : NSObject

- (instancetype)initWithQueue:(dispatch_queue_t)queue NS_DESIGNATED_INITIALIZER;
- (instancetype)init NS_UNAVAILABLE;

/**
 * Loads the MIDI file and plays it from `seconds` with the bank at `bankURL` (nil: the synth's built-in bank), and the
 * audio track's runs under it when `audio` is given (GPAudioTrackPlayer's playback dictionary; nil: no audio track).
 */
- (BOOL)playData:(NSData *)midi
     fromSeconds:(NSTimeInterval)seconds
         bankURL:(nullable NSURL *)bankURL
           audio:(nullable NSDictionary *)audio
           error:(NSError **)error;

/** The playing audio track's volume (gain 0–1) and detune (cents), heard at once. */
- (void)setAudioTrackGain:(double)gain detuneCents:(double)detuneCents;

/** Stops the song; the engine and the loaded bank stay ready for the next one, for a minute. */
- (void)stop;

/** Position in the playing song, in seconds of the MIDI file. */
@property (nonatomic, readonly) NSTimeInterval positionSeconds;

/** True while a song plays and has not reached its end. */
@property (nonatomic, readonly) BOOL isPlaying;

/** Switches a MIDI channel (0–15) to a General MIDI program (0–127) now, for the rest of the playing song. */
- (void)setProgram:(UInt8)program onChannel:(UInt8)channel;

/** Sends a control change (e.g. 7 = volume, 10 = pan) to a MIDI channel now, in the playing song. */
- (void)setController:(UInt8)controller value:(UInt8)value onChannel:(UInt8)channel;

/** The song's effects, `{ tracks, master }` (GPMixGraph): heard at once, and kept for the engines built later. */
- (void)setMix:(NSDictionary *)mix;

/** Starts the line in on an input device (nil: the default) through a track's effects; microphone access first. */
- (BOOL)startLineInWithDevice:(nullable NSString *)deviceId
                   trackIndex:(NSInteger)trackIndex
                       gainDb:(double)gainDb
                 isMonitoring:(BOOL)isMonitoring
                        error:(NSError **)error;

/** Another track, input gain or monitoring for the running line in. */
- (void)updateLineInTrack:(NSInteger)trackIndex gainDb:(double)gainDb isMonitoring:(BOOL)isMonitoring;

- (void)stopLineIn;

@property (nonatomic, readonly) BOOL isLineInOn;

/** The line in's peak since the last call, in dBFS (−120: silence or off). */
- (double)takeLineInLevel;

/**
 * Tracks of the MIDI file (0 = its first track) that stay silent: muted now in the playing song, and in every song
 * played after until changed (the metronome's track while the metronome is off — a toggle without a restart).
 */
- (void)setMutedTrackIndexes:(NSIndexSet *)indexes;

/**
 * Tracks of the MIDI file that always play on the shared synth, never through a track's strip: renderMidi's metronome
 * and count-in tracks (drum channel 10), which come after the song's tracks. Kept for every song played after.
 */
- (void)setClickTrackIndexes:(NSIndexSet *)indexes;

/**
 * Plays `key` now for `seconds` with `program` on `channel` — through the track's own strip when song track
 * `trackIndex` has effects, else on the shared synth (a key or fret previewed on hover); with the bank at `bankURL`,
 * starting the engine when it is not running (released a minute later when nothing plays).
 */
- (BOOL)playNote:(UInt8)key
        velocity:(UInt8)velocity
         program:(UInt8)program
       onChannel:(UInt8)channel
      trackIndex:(NSInteger)trackIndex
      forSeconds:(NSTimeInterval)seconds
         bankURL:(nullable NSURL *)bankURL
           error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
