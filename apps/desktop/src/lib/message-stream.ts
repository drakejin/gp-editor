// A streamed Messages API answer (`stream: true`: server-sent events) read back into the Message JSON a request
// without `stream` gets, so lib/tool-answer.ts reads both alike. The events, as the API documents them:
// message_start (the message, its usage), content_block_start / content_block_delta (text_delta, input_json_delta,
// thinking_delta, signature_delta) / content_block_stop for each block, message_delta (stop_reason, stop_details,
// usage — its output tokens are the total so far), message_stop; ping any time; error when the stream fails.
import type { ApiResponse } from '../native/anthropic';

type Json = Record<string, unknown>;

/**
 * A streamed answer read back: the whole Message; the error event it ended with, with the HTTP status that error stands
 * for (the same error before a stream starts comes as that status); or cut off — no message_stop, or an event that
 * cannot be read. `partial` is the message as far as it came (its usage), once message_start came.
 */
export type StreamedAnswer =
  | { readonly kind: 'message'; readonly message: Json }
  | { readonly kind: 'error'; readonly status: number; readonly error: Json; readonly partial?: Json }
  | { readonly kind: 'cut'; readonly partial?: Json };

/** A content block as far as its deltas came; a tool call's input is its input_json_delta pieces, parsed at its stop. */
interface BlockState {
  readonly block: Json;
  readonly inputJson: string;
  readonly isOpen: boolean;
}

interface StreamState {
  readonly message?: Json;
  readonly blocks: readonly (BlockState | undefined)[];
  readonly isStopped: boolean;
  readonly isBroken: boolean;
  readonly error?: Json;
}

const START: StreamState = { blocks: [], isStopped: false, isBroken: false };

/** The HTTP status each error type of the Messages API stands for; another type counts as a server error (500). */
const ERROR_STATUSES = new Map([
  ['invalid_request_error', 400],
  ['authentication_error', 401],
  ['billing_error', 402],
  ['permission_error', 403],
  ['not_found_error', 404],
  ['request_too_large', 413],
  ['rate_limit_error', 429],
  ['api_error', 500],
  ['overloaded_error', 529],
]);
const SERVER_ERROR = 500;
const HTTP_OK = 200;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A 200 whose content type is text/event-stream or, without one, whose first line is an SSE field or comment. */
export function isEventStream(response: ApiResponse): boolean {
  if (response.status !== HTTP_OK) {
    return false;
  }
  if (response.contentType !== undefined && response.contentType !== '') {
    return response.contentType.toLowerCase().startsWith('text/event-stream');
  }
  return /^(event|data|id|retry)?:/.test(response.body.trimStart());
}

/**
 * The data of each complete event, in order (the SSE format: lines `field: value`, an event ends at a blank line, its
 * data lines joined by line breaks, `:` lines are comments). An event the body ends in the middle of is left out.
 */
function eventData(body: string): string[] {
  const events: string[] = [];
  let data: string[] = [];
  for (const line of body.split(/\r\n|\r|\n/)) {
    if (line === '') {
      if (data.length > 0) {
        events.push(data.join('\n'));
      }
      data = [];
    } else if (line.startsWith('data:')) {
      data = [...data, line.slice(line.startsWith('data: ') ? 6 : 5)];
    }
  }
  return events;
}

/** A tool call's input from its pieces; text that is not JSON stays text, as the API hands on a parameter it cannot parse. */
function parseToolInput(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}

function withDelta(state: BlockState, delta: Json): BlockState {
  const { block } = state;
  switch (delta.type) {
    case 'text_delta':
      return { ...state, block: { ...block, text: text(block.text) + text(delta.text) } };
    case 'thinking_delta':
      return { ...state, block: { ...block, thinking: text(block.thinking) + text(delta.thinking) } };
    case 'signature_delta':
      return { ...state, block: { ...block, signature: text(delta.signature) } };
    case 'input_json_delta':
      return { ...state, inputJson: state.inputJson + text(delta.partial_json) };
    default:
      return state;
  }
}

function closeBlock(state: BlockState): BlockState {
  const block = state.inputJson === '' ? state.block : { ...state.block, input: parseToolInput(state.inputJson) };
  return { ...state, block, isOpen: false };
}

/** The state with block `index` changed by `change`; an index that is not a started block breaks the stream. */
function withBlock(state: StreamState, index: unknown, change: (block: BlockState) => BlockState): StreamState {
  const current = typeof index === 'number' ? state.blocks[index] : undefined;
  if (current === undefined || !current.isOpen) {
    return { ...state, isBroken: true };
  }
  return { ...state, blocks: state.blocks.map((block, at) => (at === index ? change(current) : block)) };
}

function startBlock(state: StreamState, event: Json): StreamState {
  const { index, content_block: block } = event;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || !isRecord(block)) {
    return { ...state, isBroken: true };
  }
  const blocks = Array.from({ length: Math.max(state.blocks.length, index + 1) }, (_, at) => state.blocks[at]);
  return { ...state, blocks: blocks.map((current, at) => (at === index ? { block, inputJson: '', isOpen: true } : current)) };
}

/** message_delta: its fields (stop_reason, stop_sequence, stop_details) on the message, its usage over the old. */
function messageDelta(message: Json, event: Json): Json {
  const delta = isRecord(event.delta) ? event.delta : {};
  const usage = isRecord(event.usage) ? Object.fromEntries(Object.entries(event.usage).filter(([, value]) => value !== null)) : {};
  return { ...message, ...delta, usage: { ...(isRecord(message.usage) ? message.usage : {}), ...usage } };
}

/** The state after one event; content before message_start breaks the stream; events after its end change nothing. */
function applyEvent(state: StreamState, event: Json): StreamState {
  if (state.isStopped || state.isBroken || state.error !== undefined) {
    return state;
  }
  if (event.type === 'error') {
    return { ...state, error: isRecord(event.error) ? event.error : {} };
  }
  if (event.type === 'message_start') {
    return isRecord(event.message) ? { ...state, message: event.message } : { ...state, isBroken: true };
  }
  const { message } = state;
  const isMessageEvent = typeof event.type === 'string' && /^(content_block_|message_)/.test(event.type);
  if (message === undefined) {
    return isMessageEvent ? { ...state, isBroken: true } : state;
  }
  switch (event.type) {
    case 'content_block_start':
      return startBlock(state, event);
    case 'content_block_delta':
      return withBlock(state, event.index, (block) => (isRecord(event.delta) ? withDelta(block, event.delta) : block));
    case 'content_block_stop':
      return withBlock(state, event.index, closeBlock);
    case 'message_delta':
      return { ...state, message: messageDelta(message, event) };
    case 'message_stop':
      // The message is whole; a block left open (a refusal may end a tool call mid-input) ends with it.
      return { ...state, isStopped: true, blocks: state.blocks.map((block) => (block?.isOpen === true ? closeBlock(block) : block)) };
    default:
      // ping, and any event type added later.
      return state;
  }
}

function readEvent(state: StreamState, data: string): StreamState {
  if (state.isBroken) {
    return state;
  }
  try {
    const event = JSON.parse(data) as unknown;
    return isRecord(event) ? applyEvent(state, event) : { ...state, isBroken: true };
  } catch {
    return { ...state, isBroken: true };
  }
}

/** Reads a streamed answer's events back into the Message, the error that ended it, or what it had when it was cut off. */
export function readMessageStream(body: string): StreamedAnswer {
  const state = eventData(body).reduce(readEvent, START);
  const partial = state.message === undefined ? undefined : { ...state.message, content: state.blocks.flatMap((block) => (block === undefined ? [] : [block.block])) };
  const withPartial = partial === undefined ? {} : { partial };
  if (state.error !== undefined) {
    return { kind: 'error', status: ERROR_STATUSES.get(text(state.error.type)) ?? SERVER_ERROR, error: state.error, ...withPartial };
  }
  const isComplete = state.isStopped && !state.isBroken;
  return isComplete && partial !== undefined ? { kind: 'message', message: partial } : { kind: 'cut', ...withPartial };
}
