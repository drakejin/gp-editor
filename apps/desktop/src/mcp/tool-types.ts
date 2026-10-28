import type { JsonObject } from './json-rpc';
import type { JsonSchema } from './json-schema';

/** MCP's hints about what a tool does (clients may show them; they are not a promise). */
export interface ToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

/** A tool's answer: its text for the model, its data as JSON when it has some, and whether it failed. */
export interface ToolResult {
  readonly text: string;
  readonly structured?: JsonObject;
  readonly isError?: boolean;
}

/** Arguments already checked against the tool's input schema. */
export type ToolArguments = Readonly<Record<string, unknown>>;

/** One tool of the server, acting through `Host` (the app's window for the real server, a fake in tests). */
export interface McpTool<Host> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly annotations: ToolAnnotations;
  readonly run: (args: ToolArguments, host: Host) => ToolResult | Promise<ToolResult>;
}

/** What the server log keeps of a request: who sent it, what it asked, and how it ended. */
export interface LogSummary {
  readonly client: string;
  readonly request: string;
  readonly outcome: string;
  readonly isError: boolean;
}
