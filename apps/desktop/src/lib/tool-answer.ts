import type { ApiResponse } from '../native/anthropic';
import { t } from './i18n/i18n';
import { isEventStream, readMessageStream } from './message-stream';

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
 * The input of the tool call a request asked for, or why there is none — whether asking again may help, and whether
 * everything must stop (the key, the account or the request itself was refused, so every request would fail alike).
 * A failed answer that the model did write still carries the tokens it cost.
 */
export type ToolAnswer =
  | { readonly isOk: true; readonly input: unknown; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly isRetryable: boolean; readonly isFatal?: boolean; readonly message: string; readonly usage?: TokenUsage };

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
/** How much of a text answer (one given instead of the tool call) a message quotes. */
const MAX_QUOTE_LENGTH = 160;

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

function usageOf(json: Record<string, unknown>): TokenUsage {
  const usage = isRecord(json.usage) ? json.usage : {};
  return { inputTokens: numberField(usage, 'input_tokens'), outputTokens: numberField(usage, 'output_tokens') };
}

/** The text the model wrote instead of calling the tool, on one line and shortened. */
function textOf(content: readonly unknown[]): string {
  const text = content
    .map((block) => (isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_QUOTE_LENGTH ? `${text.slice(0, MAX_QUOTE_LENGTH - 1)}…` : text;
}

/** An answer without the tool call: Claude may answer in text (the call is asked for, not forced), which is worth asking again. */
function withoutTool(content: readonly unknown[], wording: ToolAnswerWording, usage: TokenUsage): ToolAnswer {
  const said = textOf(content);
  const message = said === '' ? t('tools.answer.without', { what: wording.what }) : t('tools.answer.withoutSaid', { what: wording.what, said });
  return { isOk: false, isRetryable: true, message, usage };
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

/** A whole Message (the JSON of an answer, or a stream read back): the tool call's input, or why there is none. */
function readMessage(json: unknown, toolName: string, wording: ToolAnswerWording): ToolAnswer {
  if (!isRecord(json) || !Array.isArray(json.content)) {
    return failure(true, t('tools.answer.notApi'));
  }
  const usage = usageOf(json);
  if (json.stop_reason === 'max_tokens') {
    return { isOk: false, isRetryable: false, message: t('tools.answer.tooLong', { tooLong: wording.tooLong }), usage };
  }
  if (json.stop_reason === 'refusal') {
    return { isOk: false, isRetryable: false, message: t('tools.answer.declined', { what: wording.what }), usage };
  }
  const tool = json.content.find((block: unknown) => isRecord(block) && block.type === 'tool_use' && block.name === toolName);
  if (!isRecord(tool)) {
    return withoutTool(json.content, wording, usage);
  }
  return { isOk: true, input: tool.input, usage };
}

/**
 * A streamed answer: read back into the Message; an error event is read as the HTTP error it stands for (overloaded:
 * retried; a refused key: stop), and a stream cut off before its end is asked for again. Both keep the tokens they cost.
 */
function readStreamedAnswer(body: string, toolName: string, wording: ToolAnswerWording): ToolAnswer {
  const streamed = readMessageStream(body);
  if (streamed.kind === 'message') {
    return readMessage(streamed.message, toolName, wording);
  }
  const usage = streamed.partial === undefined ? {} : { usage: usageOf(streamed.partial) };
  if (streamed.kind === 'error') {
    return { ...readError(streamed.status, { error: streamed.error }), ...usage };
  }
  return { isOk: false, isRetryable: true, message: t('tools.answer.cutOff'), ...usage };
}

/**
 * Reads a Messages API answer to a request that asked for the tool `toolName` — streamed (server-sent events) or one
 * JSON body; an HTTP error comes as JSON either way. The answer may open with thinking blocks (Claude Opus 5.5 always
 * thinks first), so the call is found by its type and name, not its position. A refusal is not asked again: the same
 * page or section would be declined alike.
 */
export function readToolAnswer(response: ApiResponse, toolName: string, wording: ToolAnswerWording): ToolAnswer {
  if (isEventStream(response)) {
    return readStreamedAnswer(response.body, toolName, wording);
  }
  const json = parseJson(response.body);
  return response.status === HTTP_OK ? readMessage(json, toolName, wording) : readError(response.status, json);
}
