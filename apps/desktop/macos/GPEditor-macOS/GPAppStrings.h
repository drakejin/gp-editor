// The language of the native menus, panels and alerts: the one JS shows (Settings ▸ Language, applied through
// GPAppSettings.m), so they follow the setting live — not the process's own localization, which macOS fixes at launch
// (only macOS's own menu items, Services, Window, Quit …, wait for the next start). Texts are looked up by their
// English source text in <language>.lproj/GPEditor.strings; English, or a text missing from the table, is shown as is.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** User defaults key of the language JS last applied ("en", "ko"). */
FOUNDATION_EXPORT NSString *const GPAppLanguageDefaultsKey;

/** The language shown: the one JS last applied, else the first of the system's languages the app has, else "en". */
FOUNDATION_EXPORT NSString *GPCurrentLanguage(void);

/** The system's preferred languages ("ko-KR", "en-US" …), without the app's own AppleLanguages override. */
FOUNDATION_EXPORT NSArray<NSString *> *GPSystemLanguages(void);

/** `english` in the shown language. */
FOUNDATION_EXPORT NSString *GPLocalizedString(NSString *english);

/** A format string in the shown language, filled in (the table keeps the same %@ / %lu specifiers). */
FOUNDATION_EXPORT NSString *GPLocalizedFormat(NSString *englishFormat, ...) NS_FORMAT_FUNCTION(1, 2);

NS_ASSUME_NONNULL_END
