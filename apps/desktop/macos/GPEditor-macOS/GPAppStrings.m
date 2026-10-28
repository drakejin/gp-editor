#import "GPAppStrings.h"

NSString *const GPAppLanguageDefaultsKey = @"GPEditorLanguage";

/** The languages the app's text is written in (JS's LANGUAGES, src/lib/i18n/messages.ts). */
static NSArray<NSString *> *SupportedLanguages(void)
{
  return @[ @"en", @"ko" ];
}

NSArray<NSString *> *GPSystemLanguages(void)
{
  // The global domain's list: the app's own AppleLanguages (set for the system menus' next start) must not decide it.
  NSArray *global = [[NSUserDefaults standardUserDefaults] persistentDomainForName:NSGlobalDomain][@"AppleLanguages"];
  if ([global isKindOfClass:[NSArray class]] && global.count > 0) {
    NSMutableArray<NSString *> *languages = [NSMutableArray array];
    for (id language in global) {
      if ([language isKindOfClass:[NSString class]]) {
        [languages addObject:language];
      }
    }
    return languages;
  }
  return [NSLocale preferredLanguages];
}

NSString *GPCurrentLanguage(void)
{
  NSString *applied = [[NSUserDefaults standardUserDefaults] stringForKey:GPAppLanguageDefaultsKey];
  if (applied != nil && [SupportedLanguages() containsObject:applied]) {
    return applied;
  }
  for (NSString *tag in GPSystemLanguages()) {
    NSString *base = [[tag componentsSeparatedByCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"-_"]].firstObject lowercaseString];
    if ([SupportedLanguages() containsObject:base]) {
      return base;
    }
  }
  return @"en";
}

/** A language's table, read once: English text → translation. */
static NSDictionary<NSString *, NSString *> *TableFor(NSString *language)
{
  static NSMutableDictionary<NSString *, NSDictionary *> *tables;
  @synchronized([NSBundle mainBundle]) {
    if (tables == nil) {
      tables = [NSMutableDictionary dictionary];
    }
    NSDictionary *table = tables[language];
    if (table == nil) {
      NSString *path = [[NSBundle mainBundle] pathForResource:@"GPEditor" ofType:@"strings" inDirectory:nil forLocalization:language];
      NSString *text = path == nil ? nil : [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil];
      id parsed = nil;
      @try {
        parsed = [text propertyListFromStringsFileFormat];
      } @catch (NSException *exception) {
        parsed = nil;
      }
      table = [parsed isKindOfClass:[NSDictionary class]] ? parsed : @{};
      tables[language] = table;
    }
    return table;
  }
}

NSString *GPLocalizedString(NSString *english)
{
  NSString *language = GPCurrentLanguage();
  if ([language isEqualToString:@"en"]) {
    return english;
  }
  NSString *translated = TableFor(language)[english];
  return [translated isKindOfClass:[NSString class]] && translated.length > 0 ? translated : english;
}

NSString *GPLocalizedFormat(NSString *englishFormat, ...)
{
  va_list arguments;
  va_start(arguments, englishFormat);
  NSString *text = [[NSString alloc] initWithFormat:GPLocalizedString(englishFormat) arguments:arguments];
  va_end(arguments);
  return text;
}
