// i18n-exempt-file: protocol names and versions of the MCP server, never shown in the app
// The MCP server's facts: its endpoint, the protocol versions it speaks, its name, and the limits it keeps. The native
// listener (macos/…/GPMcpServer.m) owns the port and enforces the body and response limits it is given here
// (`attachMcpServer`), so a request over them never reaches JS.

/** The MCP endpoint: http://127.0.0.1:<port>/mcp. */
export const MCP_PATH = '/mcp';

/**
 * Protocol revisions served statelessly, each request carrying its version in `_meta` (MCP 2026-07-28 and later:
 * `server/discover`, no `initialize`).
 */
export const MODERN_VERSIONS: readonly string[] = ['2026-07-28'];

/** Revisions that open with `initialize` (2025-11-25 and earlier); newest first, the one offered to unknown requests. */
export const LEGACY_VERSIONS: readonly string[] = ['2025-11-25', '2025-06-18', '2025-03-26'];

/** Every revision the server speaks, newest first (UnsupportedProtocolVersionError's `supported`). */
export const SUPPORTED_VERSIONS: readonly string[] = [...MODERN_VERSIONS, ...LEGACY_VERSIONS];

/** A legacy request without `MCP-Protocol-Version` is 2025-03-26's, which had no such header (the spec allows it). */
export const VERSION_WITHOUT_HEADER = '2025-03-26';

/** How the server names itself (`serverInfo`); its version is the app's. */
export const SERVER_NAME = 'gp-editor';
export const SERVER_TITLE = 'GP Editor';

/** What the server takes and how long it waits. */
export const MCP_LIMITS = {
  /** Largest request body, in bytes (a tool call is a few hundred). */
  maxBodyBytes: 1_048_576,
  /** A tool that has not answered by then returns an error (`isError`), so a client never hangs on the app. */
  toolTimeoutMs: 15_000,
  /** The native listener answers 504 itself when JS has not answered a request by then (JS stuck or reloading). */
  responseTimeoutMs: 20_000,
} as const;

/** How long a client may keep `tools/list` and `server/discover` (MCP caching): the tools change only with the app. */
export const LIST_TTL_MS = 3_600_000;
