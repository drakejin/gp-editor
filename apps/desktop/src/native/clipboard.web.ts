// Windows twin of clipboard.ts. A page cannot put a private data type on the system clipboard, so the copied beats'
// JSON stays with the app (and in the browser storage, for the next run) beside the plain-text summary it puts on the
// clipboard; a paste takes them while that summary is still what the clipboard holds.

const STORAGE_KEY = 'gp-editor.copied-beats';

interface CopiedBeats {
  readonly json: string;
  readonly summary: string;
}

let copied: CopiedBeats | undefined;

function stored(): CopiedBeats | undefined {
  if (copied !== undefined) {
    return copied;
  }
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    const value: unknown = text === null ? undefined : JSON.parse(text);
    if (typeof value === 'object' && value !== null && typeof (value as CopiedBeats).json === 'string' && typeof (value as CopiedBeats).summary === 'string') {
      return value as CopiedBeats;
    }
  } catch {
    // No storage, or a value that is not ours: nothing copied.
  }
  return undefined;
}

export async function writeBeats(json: string, summary: string): Promise<void> {
  copied = { json, summary };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copied));
  } catch {
    // Storage may be off; the copy still works in this run.
  }
  try {
    await navigator.clipboard.writeText(summary);
  } catch {
    // The clipboard may refuse (no focus); the beats stay copied inside the app.
  }
}

/** The copied beats' JSON while the clipboard still holds their summary (or cannot be read); null otherwise. */
export async function readBeats(): Promise<string | null> {
  const beats = stored();
  if (beats === undefined) {
    return null;
  }
  try {
    const text = await navigator.clipboard.readText();
    return text === beats.summary ? beats.json : null;
  } catch {
    return beats.json;
  }
}
