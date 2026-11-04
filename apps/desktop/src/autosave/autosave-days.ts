// Where autosave snapshots go (Application Support/GPEditor/Autosave, GPAutosave.m): a folder per day, named by its
// local date, and in it a folder per document; the ids that name those folders; how long the days are kept.

/** Days of snapshots kept: at launch, the day folders before this many days ago are removed. */
export const AUTOSAVE_KEEP_DAYS = 7;
/** A folder id (a document's, a session's): letters, digits, `-` and `_`, never a path. */
const FOLDER_ID = /^[A-Za-z0-9_-]{1,80}$/;
const DAY_NAME = /^\d{4}-\d{2}-\d{2}$/;
/** A format the manifest keeps: a file extension of letters and digits (autosave-manifest.ts reads no other). */
const FORMAT = /^[a-z0-9]{1,16}$/;
/** Characters of a session id's random part. */
const RANDOM_LENGTH = 4;
const RANDOM_BASE = 36;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** A day's folder name: its local date, `2026-11-04`. */
export function dayName(time: Date): string {
  return `${time.getFullYear()}-${twoDigits(time.getMonth() + 1)}-${twoDigits(time.getDate())}`;
}

/** When a snapshot was written, as the panel says it: `2026-11-04 14:32` (local). */
export function timeLabel(time: Date): string {
  return `${dayName(time)} ${twoDigits(time.getHours())}:${twoDigits(time.getMinutes())}`;
}

export function isDayName(name: string): boolean {
  return DAY_NAME.test(name);
}

/** The oldest day folder kept at `now`: `keepDays` before today (the ones before it are removed). */
export function oldestKeptDay(now: Date, keepDays: number = AUTOSAVE_KEEP_DAYS): string {
  return dayName(new Date(now.getFullYear(), now.getMonth(), now.getDate() - keepDays));
}

/** A folder name that stays one folder: no separator, no dots, bounded. */
export function isFolderId(id: string): boolean {
  return FOLDER_ID.test(id);
}

/** A document's snapshot folder, relative to the autosave folder: `<day>/<document>`. */
export function snapshotFolder(day: string, documentId: string): string {
  return `${day}/${documentId}`;
}

/** This run of the app: when it started and a random part, `20261104-101530-k3f9`. */
export function newSessionId(now: Date, random: () => number = Math.random): string {
  const date = `${now.getFullYear()}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}`;
  const time = `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
  const part = Math.floor(random() * RANDOM_BASE ** RANDOM_LENGTH)
    .toString(RANDOM_BASE)
    .padStart(RANDOM_LENGTH, '0');
  return `${date}-${time}-${part}`;
}

/** A tab's document in a session: the name of its snapshot folders. */
export function documentIdOf(sessionId: string, tabId: string): string {
  return `${sessionId}-${tabId}`;
}

/** The format a file was opened from, by its extension (`gp5`, `gpx`, `ptb` …); '' for a new song, none or an odd one. */
export function formatOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  const extension = dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
  return FORMAT.test(extension) ? extension : '';
}
