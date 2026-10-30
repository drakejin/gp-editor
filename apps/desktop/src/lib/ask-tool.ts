import type { ApiResponse } from '../native/anthropic';
import { errorMessage } from './errors';
import {
  NO_USAGE,
  type TokenUsage,
  type ToolAnswer,
  type ToolAnswerWording,
  addUsage,
  readToolAnswer,
} from './tool-answer';

/** What a run that asks Claude needs from the outside world; injected so it can be tested without native code or network. */
export interface ClaudeDeps {
  readonly send: (body: string) => Promise<ApiResponse>;
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly isCancelled: () => boolean;
}

/** How a run names what it asked for, and says it was cancelled or the answer did not fit, in the shown language. */
export interface AskWording extends ToolAnswerWording {
  readonly cancelled: string;
  readonly didNotFit: (detail: string) => string;
}

/** A tool call's checked input, or why there is none — `isFatal` when everything must stop (a refused key, cancelled). */
export type Asked<T> =
  | { readonly isOk: true; readonly value: T; readonly usage: TokenUsage }
  | {
      readonly isOk: false;
      readonly isFatal: boolean;
      readonly message: string;
      readonly usage: TokenUsage;
    };

const MAX_ATTEMPTS = 3;
const FIRST_RETRY_DELAY_MS = 2000;

/**
 * One tool call with retries (backing off 2 s, 4 s): an answer without the call, a stream cut off, an overloaded or
 * server error, or an input `parse` refuses is asked for again; a refused key or request, a refusal, an answer too long
 * or cancelling stops. `onAttempt` hears each attempt (1, 2, 3) as it starts.
 */
export async function askTool<T>(
  deps: ClaudeDeps,
  body: string,
  tool: string,
  wording: AskWording,
  parse: (input: unknown) => T,
  onAttempt?: (attempt: number) => void,
): Promise<Asked<T>> {
  let usage = NO_USAGE;
  let message = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (deps.isCancelled()) {
      return { isOk: false, isFatal: true, message: wording.cancelled, usage };
    }
    if (attempt > 0) {
      await deps.wait(FIRST_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
    onAttempt?.(attempt + 1);
    const answer = await deps.send(body).then(
      response => readToolAnswer(response, tool, wording),
      (error: unknown): ToolAnswer => ({
        isOk: false,
        isRetryable: true,
        message: errorMessage(error),
      }),
    );
    if (!answer.isOk) {
      usage = addUsage(usage, answer.usage ?? NO_USAGE);
      if (!answer.isRetryable) {
        return {
          isOk: false,
          isFatal: answer.isFatal === true,
          message: answer.message,
          usage,
        };
      }
      message = answer.message;
      continue;
    }
    usage = addUsage(usage, answer.usage);
    try {
      return { isOk: true, value: parse(answer.input), usage };
    } catch (error: unknown) {
      message = wording.didNotFit(errorMessage(error));
    }
  }
  return { isOk: false, isFatal: false, message, usage };
}
