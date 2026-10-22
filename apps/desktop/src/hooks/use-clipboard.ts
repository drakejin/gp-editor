import { type Dispatch, useCallback } from 'react';
import { type BeatFragment, parseBeatFragment, serializeBeatFragment } from '@gp-editor/core';
import { errorMessage } from '../lib/errors';
import { readBeats, writeBeats } from '../native/clipboard';
import type { EditorAction, EditorState } from '../state/editor';
import { selectedFragment, selectionSummary } from '../state/selection';

/** ⌘C, ⌘X and ⌘V on beats. */
export interface Clipboard {
  /** Puts the selected beats (or the cursor's beat) on the system clipboard. */
  readonly copy: () => void;
  /**
   * Copies, then deletes the copied beats (what follows moves up) at once, so what is deleted is what was copied; if
   * the clipboard then fails, the error banner says so and ⌘Z brings the beats back.
   */
  readonly cut: () => void;
  /** Inserts the beats on the clipboard at the cursor; anything else on the clipboard is left alone. */
  readonly paste: () => void;
}

/** Longest clipboard text read as beats (far above MAX_FRAGMENT_ITEMS beats of JSON). */
export const MAX_CLIPBOARD_TEXT_LENGTH = 16 * 1024 * 1024;

/** Beats from the clipboard's text, checked (parseBeatFragment); undefined for no text, other text or anything invalid. */
export function parseClipboardText(text: string | null): BeatFragment | undefined {
  if (text === null || text.length > MAX_CLIPBOARD_TEXT_LENGTH) {
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
        }
      })
      .catch(reportFailure);
  }, [dispatch, reportFailure]);

  return { copy, cut, paste };
}
