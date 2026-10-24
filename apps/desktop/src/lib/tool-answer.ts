import type { ApiResponse } from '../native/anthropic';
import { t } from './i18n/i18n';

/** Tokens a Messages API answer used. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

/**
 * The input of the forced tool call in an answer, or why there is none — whether asking again may help, and whether
 * everything must stop (the key, the account or the request itself was refused, so every request would fail alike).
 */
export type ToolAnswer =
  | { readonly isOk: true; readonly input: unknown; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly isRetryable: boolean; readonly isFatal?: boolean; readonly message: string };

/** How to name what was asked for, in the messages. */
export interface ToolAnswerWording {
  /** e.g. "The page was too long for one answer". */
  readonly tooLong: string;
  /** e.g. "a transcription". */
  readonly what: string;
}

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

function failure(isRetryable: boolean, message: string, isFatal = false): ToolAnswer {
  return isFatal ? { isOk: false, isRetryable, isFatal, message } : { isOk: false, isRetryable, message };
}

/** An HTTP error: rate limits, overload (529) and server errors are worth retrying; the rest (key, credit, request) are not. */
function readError(status: number, json: unknown): ToolAnswer {
  const error = isRecord(json) && isRecord(json.error) ? json.error : undefined;
  const apiMessage = typeof error?.message === 'string' ? error.message : `HTTP ${status}`;
  if (status === HTTP_UNAUTHORIZED) {
    return failure(false, t('tools.answer.keyRefused', { detail: apiMessage }), true);
  }
  const isRetryable = status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERRORS;
  return failure(isRetryable, apiMessage, !isRetryable);
}

/** Reads a Messages API answer to a request that forced the tool `toolName`. */
export function readToolAnswer(response: ApiResponse, toolName: string, wording: ToolAnswerWording): ToolAnswer {
  const json = parseJson(response.body);
  if (response.status !== HTTP_OK) {
    return readError(response.status, json);
  }
  if (!isRecord(json) || !Array.isArray(json.content)) {
    return failure(true, t('tools.answer.notApi'));
  }
  if (json.stop_reason === 'max_tokens') {
    return failure(false, t('tools.answer.tooLong', { tooLong: wording.tooLong }));
  }
  const tool = json.content.find((block: unknown) => isRecord(block) && block.type === 'tool_use' && block.name === toolName);
  if (!isRecord(tool)) {
    return failure(true, t('tools.answer.without', { what: wording.what }));
  }
  const usage = isRecord(json.usage) ? json.usage : {};
  return {
    isOk: true,
    input: tool.input,
    usage: { inputTokens: numberField(usage, 'input_tokens'), outputTokens: numberField(usage, 'output_tokens') },
  };
}
