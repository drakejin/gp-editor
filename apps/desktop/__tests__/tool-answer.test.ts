import { readToolAnswer } from '../src/lib/tool-answer';
import { cutStream, messageEvents, streamEndingInError, streamedMessage, streamedResponse, toolMessage } from '../test-support/message-stream';

const WORDING = { tooLong: 'The page was too long for one answer', what: 'a transcription' };
const TOOL = 'record_transcription';
const INPUT = { measures: [{ parts: [{ track: 0, beats: [{ duration: 'whole', notes: [{ string: 1, fret: 3 }] }] }] }] };

describe('readToolAnswer with a streamed answer', () => {
  it('takes the tool input and the tokens from the events, as from a whole answer', () => {
    // Act
    const answer = readToolAnswer(streamedMessage(toolMessage(TOOL, INPUT, { input_tokens: 3200, output_tokens: 900 }), { chunk: 3 }), TOOL, WORDING);

    // Assert
    expect(answer).toEqual({ isOk: true, input: INPUT, usage: { inputTokens: 3200, outputTokens: 900 } });
  });

  it('reads a stream the native side gave no content type for', () => {
    const answer = readToolAnswer(streamedResponse(messageEvents(toolMessage(TOOL, INPUT)), undefined), TOOL, WORDING);
    expect(answer).toMatchObject({ isOk: true, input: INPUT });
  });

  it('asks again when the stream stopped before the answer was complete, counting the tokens it had', () => {
    // Act
    const answer = readToolAnswer(cutStream(toolMessage(TOOL, INPUT, { input_tokens: 3200, output_tokens: 900 }), 9), TOOL, WORDING);

    // Assert
    expect(answer).toEqual({ isOk: false, isRetryable: true, message: 'The answer stopped before it was complete', usage: { inputTokens: 3200, outputTokens: 1 } });
  });

  it('asks again after an overloaded_error event mid-stream, as after HTTP 529', () => {
    // Act
    const answer = readToolAnswer(streamEndingInError(toolMessage(TOOL, INPUT), 7, 'overloaded_error', 'Overloaded'), TOOL, WORDING);

    // Assert
    expect(answer).toEqual({ isOk: false, isRetryable: true, message: 'Overloaded', usage: { inputTokens: 1000, outputTokens: 1 } });
  });

  it('stops everything after an authentication_error event, as after HTTP 401', () => {
    const answer = readToolAnswer(streamEndingInError(toolMessage(TOOL, INPUT), 0, 'authentication_error', 'invalid x-api-key'), TOOL, WORDING);
    expect(answer).toMatchObject({ isOk: false, isRetryable: false, isFatal: true });
    expect(!answer.isOk && answer.message).toContain('invalid x-api-key');
    expect(answer).not.toHaveProperty('usage');
  });

  it('stops after an invalid_request_error event, as after HTTP 400', () => {
    const answer = readToolAnswer(streamEndingInError(toolMessage(TOOL, INPUT), 3, 'invalid_request_error', 'bad request'), TOOL, WORDING);
    expect(answer).toMatchObject({ isOk: false, isRetryable: false, isFatal: true, message: 'bad request' });
  });

  it('says the answer was too long when it stopped at max_tokens, even with its tool input cut off', () => {
    // Arrange: the input's closing pieces never came
    const message = { ...toolMessage(TOOL, INPUT), stop_reason: 'max_tokens' };
    const events = messageEvents(message).map((event) => {
      const delta = event.delta as { type?: string; partial_json?: string } | undefined;
      return delta?.type === 'input_json_delta' && delta.partial_json?.includes('}') ? { ...event, delta: { ...delta, partial_json: '' } } : event;
    });

    // Act
    const answer = readToolAnswer(streamedResponse(events), TOOL, WORDING);

    // Assert
    expect(answer).toMatchObject({ isOk: false, isRetryable: false, usage: { inputTokens: 1000, outputTokens: 200 } });
    expect(!answer.isOk && answer.message).toContain('too long');
  });

  it('does not ask again when Claude declines the page mid-stream', () => {
    const message = { stop_reason: 'refusal', stop_details: { category: null }, usage: { input_tokens: 5, output_tokens: 7 }, content: [{ type: 'text', text: 'I' }] };
    const answer = readToolAnswer(streamedMessage(message), TOOL, WORDING);
    expect(answer).toMatchObject({ isOk: false, isRetryable: false, usage: { inputTokens: 5, outputTokens: 7 } });
    expect(!answer.isOk && answer.message).toContain('declined');
  });

  it('does not ask again when a refusal ends the stream mid-way through the tool input', () => {
    // Arrange: no content_block_stop for the tool call, then the refusal and message_stop
    const events = [
      { type: 'message_start', message: { content: [], usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: TOOL, input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"measures": [' } },
      { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 30 } },
      { type: 'message_stop' },
    ];

    // Act
    const answer = readToolAnswer(streamedResponse(events), TOOL, WORDING);

    // Assert
    expect(answer).toMatchObject({ isOk: false, isRetryable: false, usage: { inputTokens: 10, outputTokens: 30 } });
    expect(!answer.isOk && answer.message).toContain('declined');
  });

  it('asks again when the streamed answer has text instead of the tool call, quoting it', () => {
    const message = { stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 7 }, content: [{ type: 'text', text: 'This page has no music.' }] };
    const answer = readToolAnswer(streamedMessage(message, { chunk: 2 }), TOOL, WORDING);
    expect(answer).toMatchObject({ isOk: false, isRetryable: true });
    expect(!answer.isOk && answer.message).toContain('This page has no music.');
  });

  it('hands a tool input that is not JSON on as its text, for the contract check to refuse', () => {
    // Arrange
    const events = [
      { type: 'message_start', message: { content: [], usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: TOOL, input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"measures": [}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
      { type: 'message_stop' },
    ];

    // Act
    const answer = readToolAnswer(streamedResponse(events), TOOL, WORDING);

    // Assert
    expect(answer).toEqual({ isOk: true, input: '{"measures": [}', usage: { inputTokens: 10, outputTokens: 20 } });
  });

  it('still reads an HTTP error the API sent as JSON before any stream', () => {
    const body = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    expect(readToolAnswer({ status: 529, body, contentType: 'application/json' }, TOOL, WORDING)).toEqual({ isOk: false, isRetryable: true, message: 'Overloaded' });
  });
});
