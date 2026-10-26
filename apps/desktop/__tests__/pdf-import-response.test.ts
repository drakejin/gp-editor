import { readTranscriptionResponse } from '../src/pdf-import/response';

function toolAnswer(input: unknown, stopReason = 'tool_use') {
  return JSON.stringify({
    type: 'message',
    stop_reason: stopReason,
    content: [{ type: 'text', text: 'Here is page 1.' }, { type: 'tool_use', name: 'record_transcription', input }],
    usage: { input_tokens: 3200, output_tokens: 900 },
  });
}

describe('readTranscriptionResponse', () => {
  it('takes the tool input and the token usage from a successful answer', () => {
    // Act
    const result = readTranscriptionResponse({ status: 200, body: toolAnswer({ measures: [] }) });

    // Assert
    expect(result).toEqual({ isOk: true, input: { measures: [] }, usage: { inputTokens: 3200, outputTokens: 900 } });
  });

  it('fails without retrying when the answer was cut off at the token limit', () => {
    const result = readTranscriptionResponse({ status: 200, body: toolAnswer({ measures: [] }, 'max_tokens') });
    expect(result).toEqual(expect.objectContaining({ isOk: false, isRetryable: false }));
    expect(result).not.toHaveProperty('isFatal');
    expect(!result.isOk && result.message).toContain('too long');
    expect(result).toMatchObject({ usage: { inputTokens: 3200, outputTokens: 900 } });
  });

  it('fails when the model did not call the tool, quoting what it said instead', () => {
    // Arrange
    const body = JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I cannot read this.' }], usage: { input_tokens: 3000, output_tokens: 40 } });

    // Act
    const result = readTranscriptionResponse({ status: 200, body });

    // Assert
    expect(result).toMatchObject({ isOk: false, isRetryable: true, usage: { inputTokens: 3000, outputTokens: 40 } });
    expect(!result.isOk && result.message).toContain('I cannot read this.');
  });

  it('shortens a long text answer in the message', () => {
    const body = JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: `${'word '.repeat(200)}END` }], usage: {} });
    const result = readTranscriptionResponse({ status: 200, body });
    expect(!result.isOk && result.message).not.toContain('END');
    expect(!result.isOk && result.message.length).toBeLessThan(300);
  });

  it('reads the tool call after the thinking blocks Claude Opus 5.5 answers with first', () => {
    // Arrange
    const body = JSON.stringify({
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'tool_use', id: 'toolu_1', name: 'record_transcription', input: { measures: [] } },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    // Act
    const result = readTranscriptionResponse({ status: 200, body });

    // Assert
    expect(result).toEqual({ isOk: true, input: { measures: [] }, usage: { inputTokens: 10, outputTokens: 20 } });
  });

  it('stops without retrying when Claude declines the page', () => {
    const body = JSON.stringify({ stop_reason: 'refusal', content: [], usage: { input_tokens: 5, output_tokens: 0 } });
    const result = readTranscriptionResponse({ status: 200, body });
    expect(result).toMatchObject({ isOk: false, isRetryable: false, usage: { inputTokens: 5, outputTokens: 0 } });
    expect(result).not.toHaveProperty('isFatal');
    expect(!result.isOk && result.message).toContain('declined');
  });

  it('retries rate limits, overload and server errors', () => {
    const error = (type: string, message: string) => JSON.stringify({ type: 'error', error: { type, message } });
    expect(readTranscriptionResponse({ status: 429, body: error('rate_limit_error', 'slow down') })).toMatchObject({ isOk: false, isRetryable: true });
    expect(readTranscriptionResponse({ status: 529, body: error('overloaded_error', 'Overloaded') })).toMatchObject({ isOk: false, isRetryable: true });
    expect(readTranscriptionResponse({ status: 500, body: 'oops' })).toMatchObject({ isOk: false, isRetryable: true });
  });

  it('stops with the API’s own words for a bad key or an empty credit balance', () => {
    const credit = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } });
    const key = JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    const lowCredit = readTranscriptionResponse({ status: 400, body: credit });
    const badKey = readTranscriptionResponse({ status: 401, body: key });
    expect(lowCredit).toEqual({ isOk: false, isRetryable: false, isFatal: true, message: 'Your credit balance is too low to access the Anthropic API.' });
    expect(badKey).toMatchObject({ isOk: false, isRetryable: false, isFatal: true });
    expect(!badKey.isOk && badKey.message).toContain('API key');
  });

  it('fails on a body that is not JSON', () => {
    expect(readTranscriptionResponse({ status: 200, body: '<html>' })).toMatchObject({ isOk: false, isRetryable: true });
  });
});
