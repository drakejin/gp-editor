import { type Translate, useT } from '../../hooks/use-i18n';
import type { ComposeDraft, ComposeStatus } from '../../hooks/use-compose';
import { useElapsedSeconds } from '../../hooks/use-elapsed-seconds';
import type { Palette } from '../../theme';
import { ClaudeRow } from '../ai-wizard/ClaudeRow';
import { WizardPanel, WizardResult } from '../ai-wizard/WizardPanel';
import { ChromeButton } from '../chrome/ChromeButton';
import { ComposeFields } from './ComposeFields';

export interface ComposePanelProps {
  readonly palette: Palette;
  readonly draft: ComposeDraft;
  readonly onChangeDraft: (change: Partial<ComposeDraft>) => void;
  readonly status: ComposeStatus;
  /** The shown score's bars; undefined when no score is open. */
  readonly barCount?: number;
  readonly cursorBar: number;
  /** "1. Lead": the cursor's track. */
  readonly currentTrack: string;
  /** The Anthropic key and model are the PDF import's; undefined until known. */
  readonly hasKey?: boolean;
  readonly model: string;
  readonly onSaveKey: (key: string) => Promise<void>;
  readonly onChooseModel: (model: string) => void;
  readonly onCompose: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
}

function statusText(
  status: ComposeStatus,
  seconds: number,
  hasScore: boolean,
  t: Translate,
): string {
  switch (status.kind) {
    case 'running':
      return status.attempt > 1
        ? t('tools.compose.askingAgain', { attempt: status.attempt, seconds })
        : t('tools.compose.asking', { seconds });
    case 'stopping':
      return t('tools.compose.stopping');
    case 'elsewhere':
      return t('tools.compose.elsewhere');
    case 'failed':
      return status.message;
    case 'done':
      return t('tools.compose.undoHint');
    case 'idle':
      return hasScore ? t('tools.compose.idle') : t('tools.compose.noScore');
  }
}

/**
 * Edit ▸ AI Wizard ▸ Compose from Here…: Claude writes bars of the open score from a start bar — the current track or all
 * tracks, maybe new tracks, as many bars as the music needs or at most a number — from the user's words.
 */
export function ComposePanel(props: ComposePanelProps) {
  const { palette, status } = props;
  const t = useT();
  const isRunning = status.kind === 'running';
  // While Claude writes here or in another tab, or a stopped answer still comes, no other run starts.
  const isBusy =
    isRunning || status.kind === 'stopping' || status.kind === 'elsewhere';
  const seconds = useElapsedSeconds(isRunning ? status.startedAt : undefined);
  const hasScore = props.barCount !== undefined;
  const buttons = (
    <>
      {isRunning ? (
        <ChromeButton
          palette={palette}
          label={t('tools.compose.stop')}
          tooltip={t('tools.compose.stopTooltip')}
          onPress={props.onCancel}
        />
      ) : null}
      <ChromeButton
        palette={palette}
        label={t('tools.compose.compose')}
        tooltip={t('tools.compose.composeTooltip')}
        isActive
        isEnabled={!isBusy && hasScore && props.hasKey === true}
        onPress={props.onCompose}
      />
    </>
  );
  return (
    <WizardPanel
      palette={palette}
      title={t('tools.compose.title')}
      subtitle={t('tools.compose.subtitle')}
      closeTooltip={t('tools.compose.closeTooltip')}
      backdropTestID="compose-backdrop"
      isRunning={isRunning}
      status={statusText(status, seconds, hasScore, t)}
      isStatusError={status.kind === 'failed'}
      buttons={buttons}
      onClose={props.onClose}
    >
      <ComposeFields
        palette={palette}
        draft={props.draft}
        onChangeDraft={props.onChangeDraft}
        barCount={props.barCount ?? 0}
        cursorBar={props.cursorBar}
        currentTrack={props.currentTrack}
      />
      <ClaudeRow
        palette={palette}
        hasKey={props.hasKey}
        model={props.model}
        onSaveKey={props.onSaveKey}
        onChooseModel={props.onChooseModel}
      />
      {status.kind === 'done' ? (
        <WizardResult
          palette={palette}
          summary={status.result.summary}
          detail={`${status.result.reading} · ${t('tools.compose.tokens', {
            input: status.result.usage.inputTokens,
            output: status.result.usage.outputTokens,
          })}`}
          warnings={status.result.warnings}
        />
      ) : null}
    </WizardPanel>
  );
}
