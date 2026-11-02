import type { AiEdit } from './use-ai-edit';
import type { Compose } from './use-compose';
import type { SongWriter } from './use-song-writer';
import { useStableCallback } from './use-stable-callback';

/** Edit ▸ AI Wizard's panels: the Song Writer, Compose from Here and AI Edit. */
export interface WizardPanels {
  readonly songWriter: SongWriter;
  readonly compose: Compose;
  readonly aiEdit: AiEdit;
}

/**
 * The AI Wizard's panels as the window shows them. One at a time: opening one puts the others away first — hidden, so a
 * run going on in one goes on (it writes into its tab when Claude answers; the panel opened says Claude is busy with it,
 * `useRunGuard`), where Close would stop it. And a request sent gives the keyboard back to the score: the request field
 * kept it, so Edit ▸ Undo and ⌘Z went to the field, not to the bars the panel says they take back. The openers and the
 * runs keep their identity (the menus' listeners hold them).
 */
export function useWizardPanels(panels: WizardPanels, focusScore: () => void): WizardPanels {
  const { songWriter, compose, aiEdit } = panels;
  const openSongWriter = useStableCallback(() => {
    compose.hide();
    aiEdit.hide();
    songWriter.open();
  });
  const openCompose = useStableCallback(() => {
    // The Song Writer's close lets its run go on: it opens the written song in a tab of its own.
    songWriter.close();
    aiEdit.hide();
    compose.open();
  });
  const openAiEdit = useStableCallback(() => {
    songWriter.close();
    compose.hide();
    aiEdit.open();
  });
  const runCompose = useStableCallback((model: string) => {
    focusScore();
    compose.compose(model);
  });
  const runAiEdit = useStableCallback((model: string) => {
    focusScore();
    aiEdit.run(model);
  });
  return {
    songWriter: { ...songWriter, open: openSongWriter },
    compose: { ...compose, open: openCompose, compose: runCompose },
    aiEdit: { ...aiEdit, open: openAiEdit, run: runAiEdit },
  };
}
