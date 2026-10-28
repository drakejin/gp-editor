// The MCP server's settings, kept in user defaults (Tools ▸ MCP Server ▸ Settings… and the menu bar item's): whether it
// starts with the app, its port, whether the menu bar shows its item. The unsandboxed QA copy honours
// GPEDITOR_MCP_PORT=<port> over the stored port (GPSandbox.h), so QA never takes the user's running app's port.

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** The default port: 18256 = 0x4750, "GP" in ASCII; registered for nothing, below the system's ephemeral range. */
FOUNDATION_EXPORT const NSInteger GPMcpDefaultPort;
/** Ports a person may choose (above the privileged ones). */
FOUNDATION_EXPORT const NSInteger GPMcpMinPort;
FOUNDATION_EXPORT const NSInteger GPMcpMaxPort;

@interface GPMcpSettings : NSObject

/** Starts when GP Editor opens (default YES: the server runs with the app). */
@property(class, nonatomic) BOOL isEnabledAtLaunch;
/** The stored port (GPMcpDefaultPort until one is chosen). */
@property(class, nonatomic) NSInteger port;
/** The menu bar shows the server's item (default YES); applied at once. */
@property(class, nonatomic) BOOL showsInMenuBar;
/** The port the server uses: GPEDITOR_MCP_PORT in the unsandboxed QA copy, else the stored one. */
@property(class, nonatomic, readonly) NSInteger effectivePort;
/** GPEDITOR_MCP_PORT decides the port (the stored one is not used). */
@property(class, nonatomic, readonly) BOOL isPortOverridden;

+ (BOOL)isValidPort:(NSInteger)port;

@end

NS_ASSUME_NONNULL_END
