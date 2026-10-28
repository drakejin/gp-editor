// What the app's Messages API requests (the PDF import, the Song Writer) add to have their answers streamed; the
// events are read back by lib/message-stream.ts. A long answer that is not streamed sends nothing until it is whole,
// so the request's idle timeout (and networks that drop idle connections) can end it.

/**
 * `stream`, and the thinking summarised: Claude Opus 5.5 and Claude Sonnet 5 think adaptively and by default stream
 * their thinking as an empty block — no event for as long as they think. Summarised, its text arrives as it goes; the
 * thinking and its cost are the same either way.
 */
export const STREAMED_ANSWER = { stream: true, thinking: { type: 'adaptive', display: 'summarized' } } as const;

/** The request fields STREAMED_ANSWER adds. */
export type StreamedAnswerFields = typeof STREAMED_ANSWER;

/**
 * A tool whose input the API streams as it is written (`eager_input_streaming`). Without it the API holds each input
 * parameter back until it is whole — a page's measures are one parameter of up to ~13,000 tokens, minutes without an
 * event. The API then leaves checking the input to the app, which it does anyway (gp-core's contract parsers).
 */
export type StreamedTool<T> = T & { readonly eager_input_streaming: true };

export function streamedTool<T extends object>(tool: T): StreamedTool<T> {
  return { ...tool, eager_input_streaming: true };
}
