import { type TranscriptionPage, parseTranscriptionPage } from '@gp-editor/core';
import type { ApiResponse } from '../native/anthropic';
import type { ImportProject } from './project-file';
import { buildTranscriptionRequest } from './request';
import { type TokenUsage, readTranscriptionResponse } from './response';

/** What an import needs from the outside world; injected so the run can be tested without native code or network. */
export interface ImportDeps {
  readonly send: (body: string) => Promise<ApiResponse>;
  /** Page n (1-based) of the project's PDF, as a one-page PDF in base64. */
  readonly pdfPage: (page: number) => Promise<string>;
  readonly readText: (file: string) => Promise<string | null>;
  readonly writeText: (file: string, text: string) => Promise<void>;
  readonly writeBase64: (file: string, base64: string) => Promise<void>;
  readonly wait: (milliseconds: number) => Promise<void>;
}

const MAX_ATTEMPTS = 3;
const FIRST_RETRY_DELAY_MS = 2000;

export type PageResult =
  | { readonly isOk: true; readonly page: TranscriptionPage; readonly usage: TokenUsage }
  | { readonly isOk: false; readonly isFatal: boolean; readonly message: string; readonly usage: TokenUsage };

const NO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One attempt at one page: the request, the answer, and the transcription checked against the contract. */
async function attemptPage(project: ImportProject, page: number, firstPage: TranscriptionPage | undefined, deps: ImportDeps): Promise<PageResult & { readonly isRetryable: boolean }> {
  let response: ApiResponse;
  try {
    const pdfBase64 = await deps.pdfPage(page);
    const request = buildTranscriptionRequest({ model: project.model, pdfBase64, page, pageCount: project.pageCount, title: project.name, firstPage });
    response = await deps.send(JSON.stringify(request));
  } catch (error: unknown) {
    return { isOk: false, isRetryable: true, isFatal: false, message: errorMessage(error), usage: NO_USAGE };
  }
  const answer = readTranscriptionResponse(response);
  if (!answer.isOk) {
    return { isOk: false, isRetryable: answer.isRetryable, isFatal: answer.isFatal === true, message: answer.message, usage: NO_USAGE };
  }
  try {
    return { isOk: true, isRetryable: false, page: parseTranscriptionPage(answer.input), usage: answer.usage };
  } catch (error: unknown) {
    return { isOk: false, isRetryable: true, isFatal: false, message: `The transcription did not fit the format: ${errorMessage(error)}`, usage: answer.usage };
  }
}

/** A page with retries (backing off 2 s, 4 s); tokens spent on failed attempts still count. */
export async function transcribePage(project: ImportProject, page: number, firstPage: TranscriptionPage | undefined, deps: ImportDeps): Promise<PageResult> {
  let usage = NO_USAGE;
  for (let attempt = 0; ; attempt++) {
    const result = await attemptPage(project, page, firstPage, deps);
    usage = addUsage(usage, result.usage);
    if (result.isOk || !result.isRetryable || attempt + 1 >= MAX_ATTEMPTS) {
      return { ...result, usage };
    }
    await deps.wait(FIRST_RETRY_DELAY_MS * 2 ** attempt);
  }
}
