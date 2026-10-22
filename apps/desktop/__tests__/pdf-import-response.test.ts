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
  });

  it('fails when the model did not call the tool', () => {
    const body = JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I cannot read this.' }], usage: {} });
    expect(readTranscriptionResponse({ status: 200, body })).toMatchObject({ isOk: false, isRetryable: true });
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
