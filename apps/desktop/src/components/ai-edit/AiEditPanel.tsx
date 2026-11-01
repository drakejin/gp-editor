import { type Translate, useT } from '../../hooks/use-i18n';
import { type AiEditDraft, type AiEditStatus, aiEditProblem, needsClaude } from '../../hooks/use-ai-edit';
import { useElapsedSeconds } from '../../hooks/use-elapsed-seconds';
import type { Palette } from '../../theme';
import { ClaudeRow } from '../ai-wizard/ClaudeRow';
import { WizardPanel, WizardResult } from '../ai-wizard/WizardPanel';
import { ChromeButton } from '../chrome/ChromeButton';
import { AiEditFields } from './AiEditFields';

export interface AiEditPanelProps {
  readonly palette: Palette;
  readonly draft: AiEditDraft;
  readonly onChangeDraft: (change: Partial<AiEditDraft>) => void;
  readonly status: AiEditStatus;
  readonly hasScore: boolean;
  /** The selection's bars, 1-based; undefined when nothing is selected. */
  readonly selectionBars?: { readonly first: number; readonly last: number };
  /** "1. Lead": the cursor's track. */
  readonly currentTrack: string;
  /** The Anthropic key and model are the PDF import's; undefined until known. */
  readonly hasKey?: boolean;
  readonly model: string;
  readonly onSaveKey: (key: string) => Promise<void>;
  readonly onChooseModel: (model: string) => void;
  readonly onRun: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
}

function runningText(status: Extract<AiEditStatus, { kind: 'running' }>, seconds: number, t: Translate): string {
  if (status.attempt > 1) {
    return t('aiEdit.askingAgain', { attempt: status.attempt, seconds });
  }
  return status.part === undefined ? t('aiEdit.asking', { seconds }) : t('aiEdit.askingPart', { part: status.part.index, parts: status.part.count, seconds });
}

function idleText(draft: AiEditDraft, problem: string | undefined, hasScore: boolean, t: Translate): string {
  if (!hasScore) {
    return t('aiEdit.noScore');
  }
  if (problem !== undefined) {
    return problem;
  }
  if (draft.kind === 'instruction') {
    return t('aiEdit.idleInstruction');
  }
  return t(draft.isPolished ? 'aiEdit.idlePolish' : 'aiEdit.idlePreset');
}

function statusText(props: AiEditPanelProps, problem: string | undefined, seconds: number, t: Translate): string {
  const { status } = props;
  switch (status.kind) {
    case 'running':
      return runningText(status, seconds, t);
    case 'stopping':
      return t('aiEdit.stopping');
    case 'elsewhere':
      return t('aiEdit.elsewhere');
    case 'failed':
      return status.message;
    case 'done':
      return t('aiEdit.undoHint');
    case 'idle':
      return idleText(props.draft, problem, props.hasScore, t);
  }
}

/**
 * Edit ▸ AI Wizard ▸ AI Edit…: the scope (the selection, the cursor's track or all tracks) and what to do with it — the
 * preset "Lower the key and make it easy to play" (exact, at once; Claude's polish when ticked) or an instruction Claude
 * carries out on the scope's bars.
 */
export function AiEditPanel(props: AiEditPanelProps) {
  const { palette, status, draft } = props;
  const t = useT();
  const isRunning = status.kind === 'running';
  // While a run goes on here or in another tab, or a stopped answer still comes, no other run starts.
  const isBusy = isRunning || status.kind === 'stopping' || status.kind === 'elsewhere';
  const seconds = useElapsedSeconds(isRunning ? status.startedAt : undefined);
  const isClaude = needsClaude(draft);
  const problem = aiEditProblem(draft, props.selectionBars !== undefined);
  const canRun = !isBusy && props.hasScore && problem === undefined && (!isClaude || props.hasKey === true);
  const buttons = (
    <>
      {isRunning ? <ChromeButton palette={palette} label={t('aiEdit.stop')} tooltip={t('aiEdit.stopTooltip')} onPress={props.onCancel} /> : null}
      <ChromeButton
        palette={palette}
        label={t(isClaude ? 'aiEdit.ask' : 'aiEdit.apply')}
        tooltip={t(isClaude ? 'aiEdit.askTooltip' : 'aiEdit.applyTooltip')}
        isActive
        isEnabled={canRun}
        onPress={props.onRun}
      />
    </>
  );
  return (
    <WizardPanel
      palette={palette}
      title={t('aiEdit.title')}
      subtitle={t('aiEdit.subtitle')}
      closeTooltip={t('aiEdit.closeTooltip')}
      backdropTestID="ai-edit-backdrop"
      isRunning={isRunning}
      status={statusText(props, problem, seconds, t)}
      isStatusError={status.kind === 'failed'}
      buttons={buttons}
      onClose={props.onClose}
    >
      <AiEditFields palette={palette} draft={draft} onChangeDraft={props.onChangeDraft} selectionBars={props.selectionBars} currentTrack={props.currentTrack} />
      {isClaude ? <ClaudeRow palette={palette} hasKey={props.hasKey} model={props.model} onSaveKey={props.onSaveKey} onChooseModel={props.onChooseModel} /> : null}
      {status.kind === 'done' ? <WizardResult palette={palette} summary={status.result.summary} detail={status.result.detail} warnings={status.result.warnings} /> : null}
    </WizardPanel>
  );
}
