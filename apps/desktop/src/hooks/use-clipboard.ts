import { type Dispatch, useCallback } from 'react';
import { type BeatFragment, parseBeatFragment, serializeBeatFragment } from '@gp-editor/core';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { readBeats, writeBeats } from '../native/clipboard';
import type { EditorAction, EditorState } from '../state/editor';
import { selectedFragment, selectionSummary } from '../state/selection';

/** ⌘C, ⌘X and ⌘V on beats. */
export interface Clipboard {
  /** Puts the selected beats (or the cursor's beat) on the system clipboard. */
  readonly copy: () => void;
  /**
   * Copies, then takes the copied beats out (rests in their place) at once, so what is taken out is what was copied; if
   * the clipboard then fails, the error banner says so and ⌘Z brings the beats back.
   */
  readonly cut: () => void;
  /** Writes the beats on the clipboard over the cursor's track from the cursor; the hint says when there are none to paste. */
  readonly paste: () => void;
}

/** Beats from the clipboard's text, however many, checked (parseBeatFragment); undefined for no text, other text or anything invalid. */
export function parseClipboardText(text: string | null): BeatFragment | undefined {
  if (text === null) {
    return undefined;
  }
  try {
    return parseBeatFragment(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** Copy, cut and paste through the system clipboard; a clipboard failure goes to the error banner (`clipboardFailed`). */
export function useClipboard(state: EditorState, dispatch: Dispatch<EditorAction>): Clipboard {
  const { document, cursor, selectionAnchor } = state;
  const reportFailure = useCallback((error: unknown) => dispatch({ type: 'clipboardFailed', message: errorMessage(error) }), [dispatch]);

  // True when there were beats to copy.
  const writeSelection = useCallback((): boolean => {
    const selection = { document, cursor, selectionAnchor };
    const fragment = selectedFragment(selection);
    if (fragment === undefined) {
      return false;
    }
    Promise.resolve()
      .then(() => writeBeats(serializeBeatFragment(fragment), selectionSummary(selection, fragment)))
      .catch(reportFailure);
    return true;
  }, [document, cursor, selectionAnchor, reportFailure]);

  const copy = useCallback(() => {
    writeSelection();
  }, [writeSelection]);

  const cut = useCallback(() => {
    if (writeSelection()) {
      dispatch({ type: 'cutSelection' });
    }
  }, [writeSelection, dispatch]);

  const paste = useCallback(() => {
    Promise.resolve()
      .then(readBeats)
      .then((text) => {
        const fragment = parseClipboardText(text);
        if (fragment !== undefined) {
          dispatch({ type: 'pasteBeats', fragment });
        } else {
          // Never silent: no beats copied, or beats that cannot be read.
          dispatch({ type: 'showHint', hint: t(text === null ? 'palette.hint.pasteEmptyClipboard' : 'palette.hint.pasteClipboardUnreadable') });
        }
      })
      .catch(reportFailure);
  }, [dispatch, reportFailure]);

  return { copy, cut, paste };
}
