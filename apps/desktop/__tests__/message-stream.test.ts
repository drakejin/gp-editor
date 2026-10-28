import { isEventStream, readMessageStream } from '../src/lib/message-stream';
import { messageEvents, sseText, toolMessage } from '../test-support/message-stream';

const USAGE = { input_tokens: 3200, output_tokens: 900 };

/** A band page's tool input: long enough to arrive in hundreds of input_json_delta pieces. */
const PAGE_INPUT = {
  measures: Array.from({ length: 40 }, (_, bar) => ({
    lyrics: ['la', 'lé "quoted"'],
    parts: [{ track: 0, beats: [{ duration: 'quarter', notes: [{ string: 1 + (bar % 6), fret: bar % 13 }] }] }],
  })),
};

describe('readMessageStream', () => {
  it('reads a text answer back into the Message a request without stream gets', () => {
    // Arrange
    const message = { stop_reason: 'end_turn', usage: USAGE, content: [{ type: 'text', text: 'Hello, this page is blank.' }] };

    // Act
    const read = readMessageStream(sseText(messageEvents(message, { chunk: 4 })));

    // Assert
    expect(read).toEqual({
      kind: 'message',
      message: expect.objectContaining({ type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hello, this page is blank.' }] }),
    });
  });

  it('joins a tool input split over many input_json_delta events and parses it once, when its block stops', () => {
    // Arrange
    const events = messageEvents(toolMessage('record_transcription', PAGE_INPUT), { chunk: 5 });
    const pieces = events.filter((event) => (event.delta as { type?: string } | undefined)?.type === 'input_json_delta');

    // Act
    const read = readMessageStream(sseText(events));

    // Assert
    expect(pieces.length).toBeGreaterThan(500);
    expect(read.kind === 'message' && read.message.content).toEqual([
      { type: 'thinking', thinking: 'Reading the staves.', signature: 'sig' },
      { type: 'tool_use', id: 'toolu_1', name: 'record_transcription', input: PAGE_INPUT },
    ]);
  });

  it('keeps the thinking block, its text and signature, before the tool call', () => {
    const events = messageEvents(toolMessage('plan_song', { title: 'x' }), { chunk: 3 });
    const read = readMessageStream(sseText(events));
    expect(read.kind === 'message' && read.message.content).toEqual([
      { type: 'thinking', thinking: 'Reading the staves.', signature: 'sig' },
      expect.objectContaining({ type: 'tool_use', input: { title: 'x' } }),
    ]);
  });

  it('gives a tool call without input pieces the input it started with', () => {
    // Arrange: a tool that takes no parameters streams no input_json_delta
    const events = [
      { type: 'message_start', message: { content: [], usage: { input_tokens: 5, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'ping_tool', input: {} } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ];

    // Act
    const read = readMessageStream(sseText(events));

    // Assert
    expect(read.kind === 'message' && read.message.content).toEqual([{ type: 'tool_use', id: 't', name: 'ping_tool', input: {} }]);
  });

  it('takes the stop reason, its details and the usage from message_delta, whose output tokens are the total so far', () => {
    // Arrange: message_start counts 1 output token, message_delta the whole answer's
    const message = { stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: null }, usage: USAGE, content: [{ type: 'text', text: 'Partial' }] };

    // Act
    const read = readMessageStream(sseText(messageEvents(message, { startOutputTokens: 1 })));

    // Assert
    expect(read.kind === 'message' && read.message).toMatchObject({
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
      usage: { input_tokens: 3200, output_tokens: 900 },
    });
  });

  it('reports max_tokens when the answer ran out of room, keeping a tool input cut off mid-way as its text', () => {
    // Arrange: the input stops in the middle of the JSON
    const events = [
      { type: 'message_start', message: { content: [], usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'record_transcription', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"measures": [{"parts' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 64000 } },
      { type: 'message_stop' },
    ];

    // Act
    const read = readMessageStream(sseText(events));

    // Assert
    expect(read.kind === 'message' && read.message).toMatchObject({
      stop_reason: 'max_tokens',
      usage: { output_tokens: 64000 },
      content: [{ type: 'tool_use', input: '{"measures": [{"parts' }],
    });
  });

  it('ignores pings, comments and events it does not know', () => {
    // Arrange
    const events = messageEvents({ stop_reason: 'end_turn', usage: USAGE, content: [{ type: 'text', text: 'Hi' }] });
    const withExtras = [events[0] ?? {}, { type: 'ping' }, { type: 'some_future_event', detail: 1 }, ...events.slice(1)];

    // Act
    const read = readMessageStream(`: keep-alive\n\n${sseText(withExtras)}`);

    // Assert
    expect(read.kind === 'message' && read.message.content).toEqual([{ type: 'text', text: 'Hi' }]);
  });

  it('reads events framed with CRLF and data over several lines', () => {
    // Arrange
    const events = messageEvents({ stop_reason: 'end_turn', usage: USAGE, content: [{ type: 'text', text: 'Hi there' }] });
    const body = events.map((event) => `event: ${String(event.type)}\r\ndata: ${JSON.stringify(event, null, 1).split('\n').join('\r\ndata: ')}\r\n\r\n`).join('');

    // Act
    const read = readMessageStream(body);

    // Assert
    expect(read.kind === 'message' && read.message.content).toEqual([{ type: 'text', text: 'Hi there' }]);
  });

  it.each([
    ['overloaded_error', 529],
    ['rate_limit_error', 429],
    ['api_error', 500],
    ['authentication_error', 401],
    ['billing_error', 402],
    ['permission_error', 403],
    ['invalid_request_error', 400],
    ['request_too_large', 413],
    ['a_new_error', 500],
  ])('returns an %s event as the HTTP error it stands for (%i)', (type, status) => {
    // Arrange: the error comes after part of the answer
    const events = messageEvents(toolMessage('record_transcription', PAGE_INPUT)).slice(0, 6);

    // Act
    const read = readMessageStream(sseText([...events, { type: 'error', error: { type, message: 'Overloaded' } }]));

    // Assert
    expect(read).toEqual({ kind: 'error', status, error: { type, message: 'Overloaded' }, partial: expect.objectContaining({ usage: { input_tokens: 1000, output_tokens: 1 } }) });
  });

  it('returns an error event before message_start without a partial answer', () => {
    const read = readMessageStream(sseText([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }]));
    expect(read).toEqual({ kind: 'error', status: 529, error: { type: 'overloaded_error', message: 'Overloaded' } });
  });

  it('calls a stream that ended before message_stop cut off, keeping what it had', () => {
    // Arrange
    const events = messageEvents(toolMessage('record_transcription', PAGE_INPUT));

    // Act
    const read = readMessageStream(sseText(events.slice(0, -2)));

    // Assert
    expect(read).toEqual({ kind: 'cut', partial: expect.objectContaining({ usage: { input_tokens: 1000, output_tokens: 1 } }) });
  });

  it('calls a stream cut off in the middle of an event cut off', () => {
    const text = sseText(messageEvents(toolMessage('record_transcription', PAGE_INPUT)));
    expect(readMessageStream(text.slice(0, text.length - 12)).kind).toBe('cut');
    expect(readMessageStream(text.slice(0, Math.floor(text.length / 2))).kind).toBe('cut');
  });

  it('calls an empty stream, or one with an unreadable event, cut off', () => {
    const events = messageEvents({ stop_reason: 'end_turn', usage: USAGE, content: [{ type: 'text', text: 'Hi' }] });
    const broken = sseText(events).replace('"type":"ping"', '"type":"ping"}}}');
    expect(readMessageStream('')).toEqual({ kind: 'cut' });
    expect(readMessageStream(broken).kind).toBe('cut');
  });

  it('calls a stream with a block that never stopped cut off', () => {
    const events = messageEvents(toolMessage('plan_song', { title: 'x' }));
    const withoutStop = events.filter((event) => !(event.type === 'content_block_stop' && event.index === 1));
    expect(readMessageStream(sseText(withoutStop)).kind).toBe('cut');
  });
});

describe('isEventStream', () => {
  const sse = sseText(messageEvents({ stop_reason: 'end_turn', usage: USAGE, content: [] }));

  it('knows a stream by its content type', () => {
    expect(isEventStream({ status: 200, body: sse, contentType: 'text/event-stream' })).toBe(true);
    expect(isEventStream({ status: 200, body: sse, contentType: 'Text/Event-Stream; charset=utf-8' })).toBe(true);
    expect(isEventStream({ status: 200, body: '{"content":[]}', contentType: 'application/json' })).toBe(false);
  });

  it('knows a stream by its first line when the native side gives no content type', () => {
    expect(isEventStream({ status: 200, body: sse })).toBe(true);
    expect(isEventStream({ status: 200, body: `data: {"type":"ping"}\n\n${sse}` })).toBe(true);
    expect(isEventStream({ status: 200, body: '{"content":[]}' })).toBe(false);
    expect(isEventStream({ status: 200, body: '' })).toBe(false);
  });

  it('reads an HTTP error as JSON, as the API sends it before a stream starts', () => {
    expect(isEventStream({ status: 529, body: '{"type":"error","error":{"type":"overloaded_error"}}', contentType: 'application/json' })).toBe(false);
    expect(isEventStream({ status: 529, body: sse, contentType: 'text/event-stream' })).toBe(false);
  });
});
