// The sound banks playback can use: GeneralUser GS (bundled, when scripts/soundfont/fetch.sh put it in the app), the
// General MIDI bank that ships with macOS, and SoundFonts (.sf2) or DLS banks the user added — copied into the app's
// Application Support folder, so the sandbox can read them on every launch. The choice is kept in user defaults.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GPSoundBanks : NSObject

/** { banks: [{ id, name, isRemovable }], selectedId } for the JS side. */
+ (NSDictionary *)state;

/** Selects a bank by id; NO when there is no such bank. */
+ (BOOL)selectBankWithId:(NSString *)bankId;

/** Copies a .sf2/.dls file into the app's sound bank folder and selects it; nil with `error` set when it fails. */
+ (nullable NSString *)addBankFromURL:(NSURL *)url error:(NSError **)error;

/** Deletes a bank the user added; NO when the id is not such a bank or the file could not be removed. */
+ (BOOL)removeBankWithId:(NSString *)bankId error:(NSError **)error;

/** File of the selected bank, falling back to the first available one; nil when there is none at all. */
+ (nullable NSURL *)selectedBankURL;

@end

NS_ASSUME_NONNULL_END
