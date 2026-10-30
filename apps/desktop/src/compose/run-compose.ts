import {
  type ComposedBars,
  type Song,
  WRITE_BARS_TOOL,
  parseComposedBars,
} from '@gp-editor/core';
import { type AskWording, type ClaudeDeps, askTool } from '../lib/ask-tool';
import { t } from '../lib/i18n/i18n';
import type { TokenUsage } from '../lib/tool-answer';
import {
  type ComposeIdea,
  buildComposeRequest,
  composeScopeOf,
} from './request';
import type { ScoreText } from './score-text';

/** Where a run is, for the progress line: asking Claude, the attempt (1–3) counted. */
export interface ComposeStep {
  readonly kind: 'asking';
  readonly attempt: number;
}

/** The checked bars to write (applyComposedBars), the score text Claude read, the tokens; or why there are none. */
export type ComposeRunResult =
  | {
      readonly isOk: true;
      readonly composed: ComposedBars;
      readonly score: ScoreText;
      readonly usage: TokenUsage;
    }
  | {
      readonly isOk: false;
      readonly message: string;
      readonly usage: TokenUsage;
    };

const composeWording = (): AskWording => ({
  tooLong: t('tools.compose.tooLong'),
  what: t('tools.compose.theBars'),
  cancelled: t('tools.compose.cancelled'),
  didNotFit: detail => t('tools.compose.didNotFit', { detail }),
});

/**
 * Compose from Here: asks Claude once for write_bars (asked again on a cut-off, overloaded or unreadable answer, up to
 * three times) with the whole score, its instruments and what may be written, then checks the answer against that
 * scope (parseComposedBars). An answer without bars fails with Claude's warnings. The song is not changed here: the
 * editor applies the bars as one undo step.
 */
export async function runCompose(
  song: Song,
  idea: ComposeIdea,
  model: string,
  deps: ClaudeDeps,
  onStep: (step: ComposeStep) => void,
): Promise<ComposeRunResult> {
  // The score's text takes a moment on a long score: the panel shows the run first.
  await deps.wait(0);
  const { body, score } = buildComposeRequest(song, model, idea);
  const scope = composeScopeOf(song, idea);
  const asked = await askTool(
    deps,
    JSON.stringify(body),
    WRITE_BARS_TOOL.name,
    composeWording(),
    input => parseComposedBars(input, scope),
    attempt => onStep({ kind: 'asking', attempt }),
  );
  if (!asked.isOk) {
    return { isOk: false, message: asked.message, usage: asked.usage };
  }
  if (asked.value.bars.length === 0) {
    const reasons = asked.value.warnings.join(' ').trim();
    return {
      isOk: false,
      message: t('tools.compose.nothingWritten', {
        detail: reasons === '' ? t('tools.compose.noReason') : reasons,
      }),
      usage: asked.usage,
    };
  }
  return { isOk: true, composed: asked.value, score, usage: asked.usage };
}
