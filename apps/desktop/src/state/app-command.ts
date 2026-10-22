import type { ScoreMode } from '../score/geometry';
import type { EditorAction } from './editor';

/** Where the transport's bar buttons move the cursor (and playback, while playing). */
export type BarJump = 'first' | 'previous' | 'next' | 'last';

/**
 * What a button of the top bar or the edition palette does: an editor action, a file command (a new sheet in a view,
 * opening, importing a PDF, saving, the export panel), playback, or a jump to another bar.
 */
export type AppCommand =
  | EditorAction
  | { readonly type: 'newFile'; readonly mode?: ScoreMode }
  | { readonly type: 'openFile' }
  | { readonly type: 'importPdf' }
  | { readonly type: 'saveFile' }
  | { readonly type: 'exportPdf' }
  | { readonly type: 'togglePlayback' }
  | { readonly type: 'goToBar'; readonly jump: BarJump };

/** The bar a jump lands on, from the cursor's bar, within the song's bars. */
export function jumpTarget(jump: BarJump, measureIndex: number, measureCount: number): number {
  const last = Math.max(0, measureCount - 1);
  switch (jump) {
    case 'first':
      return 0;
    case 'previous':
      return Math.max(0, measureIndex - 1);
    case 'next':
      return Math.min(last, measureIndex + 1);
    case 'last':
      return last;
  }
}
