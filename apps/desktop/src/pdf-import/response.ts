import { TRANSCRIPTION_TOOL } from '@gp-editor/core';
import type { ApiResponse } from '../native/anthropic';
import { type ToolAnswer, readToolAnswer } from '../lib/tool-answer';

export type { TokenUsage } from '../lib/tool-answer';

/** A page's answer: the tool input to parse, or why there is none (see ToolAnswer). */
export type TranscriptionResponse = ToolAnswer;

/** Reads a Messages API answer to a transcription request (see request.ts). */
export function readTranscriptionResponse(response: ApiResponse): TranscriptionResponse {
  return readToolAnswer(response, TRANSCRIPTION_TOOL.name, { tooLong: 'The page was too long for one answer', what: 'a transcription' });
}
