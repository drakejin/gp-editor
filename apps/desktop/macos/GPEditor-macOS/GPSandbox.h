// Whether this process runs in the App Sandbox. QA-only environment overrides (GPEDITOR_ANTHROPIC_URL,
// GPEDITOR_QA_PDF_PATH) are honoured only when it does not — the shipped app is sandboxed, so no environment variable
// can redirect it.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** YES when the process has the app-sandbox entitlement (or when that cannot be read). */
FOUNDATION_EXPORT BOOL GPIsSandboxed(void);

NS_ASSUME_NONNULL_END
