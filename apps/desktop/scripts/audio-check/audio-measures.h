// The audio check's synthetic song and the measures its checks take of a rendered buffer.

#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

/** Every render of the check is stereo at this rate. */
static const double kRate = 44100;

double Db(double ratio);

/** One chord (`keys`) on a GM program for a second at 120 bpm, then three seconds of silence. */
NSData *ChordMidi(uint8_t program, NSArray<NSNumber *> *keys);

/** Mean square of both channels over [from, to) seconds. */
double Power(AVAudioPCMBuffer *buffer, double from, double to);

float Peak(AVAudioPCMBuffer *buffer);

/** Energy of the left channel in [low, high) Hz over the first 0.74 s. */
double BandEnergy(AVAudioPCMBuffer *buffer, double low, double high);

/** The strongest frequency (Hz, to a bin of 5.4 Hz) in the 0.19 s of the left channel from `from` seconds; 0 in silence. */
double DominantFrequency(AVAudioPCMBuffer *buffer, double from);

/** Correlation of left and right over the first second: 1 for a centred mono sound. */
double Correlation(AVAudioPCMBuffer *buffer);

double ResidentMegabytes(void);

NS_ASSUME_NONNULL_END
