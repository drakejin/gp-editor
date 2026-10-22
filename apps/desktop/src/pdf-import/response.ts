import type { ApiResponse } from '../native/anthropic';

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * A page's answer: the tool input to parse, or why there is none — whether asking again may help, and whether the
 * whole import must stop (the key, the account or the request itself was refused, so every page would fail alike).
 */
export type TranscriptionResponse =
  | { readonly isOk: true; readonly input: unknown; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly isRetryable: boolean; readonly isFatal?: boolean; readonly message: string };

const TOOL_NAME = 'record_transcription';
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERRORS = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function failure(isRetryable: boolean, message: string, isFatal = false): TranscriptionResponse {
  return isFatal ? { isOk: false, isRetryable, isFatal, message } : { isOk: false, isRetryable, message };
}

/** An HTTP error: rate limits, overload (529) and server errors are worth retrying; the rest (key, credit, request) are not. */
function readError(status: number, json: unknown): TranscriptionResponse {
  const error = isRecord(json) && isRecord(json.error) ? json.error : undefined;
  const apiMessage = typeof error?.message === 'string' ? error.message : `HTTP ${status}`;
  if (status === HTTP_UNAUTHORIZED) {
    return failure(false, `The Anthropic API key was refused (${apiMessage})`, true);
  }
  const isRetryable = status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERRORS;
  return failure(isRetryable, apiMessage, !isRetryable);
}

/** Reads a Messages API answer to a transcription request (see request.ts). */
export function readTranscriptionResponse(response: ApiResponse): TranscriptionResponse {
  const json = parseJson(response.body);
  if (response.status !== HTTP_OK) {
    return readError(response.status, json);
  }
  if (!isRecord(json) || !Array.isArray(json.content)) {
    return failure(true, 'The answer was not a Messages API response');
  }
  if (json.stop_reason === 'max_tokens') {
    return failure(false, 'The page was too long for one answer (the model hit its output limit)');
  }
  const tool = json.content.find((block: unknown) => isRecord(block) && block.type === 'tool_use' && block.name === TOOL_NAME);
  if (!isRecord(tool)) {
    return failure(true, 'The model answered without a transcription');
  }
  const usage = isRecord(json.usage) ? json.usage : {};
  return {
    isOk: true,
    input: tool.input,
    usage: { inputTokens: numberField(usage, 'input_tokens'), outputTokens: numberField(usage, 'output_tokens') },
  };
}
