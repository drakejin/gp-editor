// Streamed Messages API answers for the tests: a Message (as a request without `stream` gets it) turned into the
// server-sent events a streamed request gets — message_start, a ping, each block's start / deltas / stop,
// message_delta, message_stop — framed as the API frames them (`event:` and `data:` lines, a blank line after each).
import type { ApiResponse } from '../src/native/anthropic';

type Json = Record<string, unknown>;

export interface StreamOptions {
  /** Characters per text / thinking / input_json_delta piece. */
  readonly chunk?: number;
  /** Output tokens message_start reports (message_delta then reports the message's total). */
  readonly startOutputTokens?: number;
}

/** Text in pieces of `size` characters. */
function pieces(text: string, size: number): string[] {
  return Array.from({ length: Math.ceil(text.length / size) }, (_, index) => text.slice(index * size, (index + 1) * size));
}

/** The start, deltas and stop of one content block. */
function blockEvents(block: Json, index: number, size: number): Json[] {
  const delta = (value: Json): Json => ({ type: 'content_block_delta', index, delta: value });
  const stop = { type: 'content_block_stop', index };
  if (block.type === 'thinking') {
    const thinking = pieces(String(block.thinking ?? ''), size).map((text) => delta({ type: 'thinking_delta', thinking: text }));
    const start = { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } };
    return [start, ...thinking, delta({ type: 'signature_delta', signature: block.signature }), stop];
  }
  if (block.type === 'tool_use') {
    const input = pieces(JSON.stringify(block.input), size).map((json) => delta({ type: 'input_json_delta', partial_json: json }));
    return [{ type: 'content_block_start', index, content_block: { ...block, input: {} } }, ...input, stop];
  }
  const text = pieces(String(block.text ?? ''), size).map((value) => delta({ type: 'text_delta', text: value }));
  return [{ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }, ...text, stop];
}

/** The events a streamed request answers `message` with. */
export function messageEvents(message: Json, options: StreamOptions = {}): Json[] {
  const { content = [], stop_reason: stopReason, stop_details: stopDetails, usage = {}, ...rest } = message as Json & { content?: Json[]; usage?: Json };
  const startUsage = { ...usage, output_tokens: options.startOutputTokens ?? 1 };
  const start = { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', ...rest, content: [], stop_reason: null, stop_sequence: null, usage: startUsage } };
  const blocks = content.flatMap((block, index) => blockEvents(block, index, options.chunk ?? 7));
  const end = { stop_reason: stopReason ?? 'end_turn', stop_sequence: null, ...(stopDetails === undefined ? {} : { stop_details: stopDetails }) };
  const messageDelta = { type: 'message_delta', delta: end, usage: { output_tokens: (usage as Json).output_tokens ?? 0 } };
  return [start, { type: 'ping' }, ...blocks, messageDelta, { type: 'message_stop' }];
}

/** Events as the stream's text. */
export function sseText(events: readonly Json[]): string {
  return events.map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

/** A streamed answer of HTTP 200 carrying `events`. */
export function streamedResponse(events: readonly Json[], contentType: string | undefined = 'text/event-stream; charset=utf-8'): ApiResponse {
  return contentType === undefined ? { status: 200, body: sseText(events) } : { status: 200, body: sseText(events), contentType };
}

/** `message` answered as a stream. */
export function streamedMessage(message: Json, options: StreamOptions = {}): ApiResponse {
  return streamedResponse(messageEvents(message, options));
}

/** A stream that ends after its first `count` events (no message_stop). */
export function cutStream(message: Json, count: number): ApiResponse {
  return streamedResponse(messageEvents(message).slice(0, count));
}

/** A stream that begins as `message` would and ends with an error event after `count` events. */
export function streamEndingInError(message: Json, count: number, type: string, text: string): ApiResponse {
  return streamedResponse([...messageEvents(message).slice(0, count), { type: 'error', error: { type, message: text } }]);
}

/** A Message calling `name` with `input`, after a thinking block (Claude Opus 5.5 always thinks first). */
export function toolMessage(name: string, input: unknown, usage: Json = { input_tokens: 1000, output_tokens: 200 }): Json {
  const thinking = { type: 'thinking', thinking: 'Reading the staves.', signature: 'sig' };
  return { stop_reason: 'tool_use', usage, content: [thinking, { type: 'tool_use', id: 'toolu_1', name, input }] };
}
