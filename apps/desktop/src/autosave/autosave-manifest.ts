// An autosave snapshot's manifest (`manifest.json` beside `snapshot.gp`, GPAutosave.m): what the snapshot is of — the
// file it was opened from or saved to (none for a new song), its title and format —, when it was written, the session
// that wrote it and whether its work is only there. Read back as untrusted JSON: own properties, bounded texts, ids
// that name one folder.
import { isFolderId } from './autosave-days';

/**
 * `unsaved`: the work is only in the snapshot (offered after a crash); `saved`: its tab was saved, or went back to its
 * file; `discarded`: closed or quit with Don't Save; `declined`: Don't Restore; `restored`: opened again in a tab, whose
 * own snapshots carry it on; `replaced`: a newer snapshot of the same document (another day's) carries it on.
 */
export const AUTOSAVE_STATUSES = ['unsaved', 'saved', 'discarded', 'declined', 'restored', 'replaced'] as const;
export type AutosaveStatus = (typeof AUTOSAVE_STATUSES)[number];

const MANIFEST_VERSION = 1;
/** Characters of a manifest read at most. */
const MAX_MANIFEST_LENGTH = 64 * 1024;
const MAX_TITLE_LENGTH = 500;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_PATH_LENGTH = 4096;
const FORMAT = /^[a-z0-9]{0,16}$/;
const MAX_PROCESS_ID = 2_147_483_647;
/** kern.bootsessionuuid: a UUID. */
const BOOT_ID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
/** A snapshot's making time beyond this is no time. */
const MAX_WRITE_MS = 600_000;

/**
 * The run of the app that wrote a snapshot: its id, its process and the Mac's boot it ran in (the process still running
 * in this boot: the snapshot is live work; a session of another boot is over, whatever process has its id now).
 */
export interface AutosaveSession {
  readonly id: string;
  readonly pid: number;
  /** kern.bootsessionuuid when it was known. */
  readonly bootId?: string;
}

export interface AutosaveManifest {
  readonly version: 1;
  /** The document (a tab of a session): the name of its snapshot folders. */
  readonly documentId: string;
  /** The song's title, else the file's name, as its tab showed it. */
  readonly title: string;
  readonly fileName: string;
  /** The file it was opened from or last saved to; '' for a song no file holds yet. */
  readonly path: string;
  /** That file's format, by its extension ('gp5', 'gpx', 'ptb' …); '' for a new song. */
  readonly format: string;
  /** When the snapshot was written (ISO 8601). */
  readonly savedAt: string;
  readonly session: AutosaveSession;
  readonly status: AutosaveStatus;
  /** How long making the snapshot took in JS (writeSong and base64), in ms, for the record. */
  readonly writeMs?: number;
}

type RawObject = Readonly<Record<string, unknown>>;

function isRawObject(value: unknown): value is RawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An own property of a JSON object (never one from its prototype). */
function ownValue(object: RawObject, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
}

function wholeNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function folderId(value: unknown): string | undefined {
  return typeof value === 'string' && isFolderId(value) ? value : undefined;
}

function parseSession(value: unknown): AutosaveSession | undefined {
  if (!isRawObject(value)) {
    return undefined;
  }
  const id = folderId(ownValue(value, 'id'));
  const pid = wholeNumber(ownValue(value, 'pid'), 1, MAX_PROCESS_ID);
  const bootId = ownValue(value, 'bootId');
  if (id === undefined || pid === undefined) {
    return undefined;
  }
  if (bootId === undefined) {
    return { id, pid };
  }
  return typeof bootId === 'string' && BOOT_ID.test(bootId) ? { id, pid, bootId } : undefined;
}

function parseStatus(value: unknown): AutosaveStatus | undefined {
  return AUTOSAVE_STATUSES.find((status) => status === value);
}

function parseTime(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function parseFormat(value: unknown): string | undefined {
  return typeof value === 'string' && FORMAT.test(value) ? value : undefined;
}

/** The manifest's fields, each checked; undefined when one is missing or wrong. */
function readFields(raw: RawObject): AutosaveManifest | undefined {
  const documentId = folderId(ownValue(raw, 'documentId'));
  const title = boundedText(ownValue(raw, 'title'), MAX_TITLE_LENGTH);
  const fileName = boundedText(ownValue(raw, 'fileName'), MAX_FILE_NAME_LENGTH);
  const path = boundedText(ownValue(raw, 'path'), MAX_PATH_LENGTH);
  const format = parseFormat(ownValue(raw, 'format'));
  const savedAt = parseTime(ownValue(raw, 'savedAt'));
  const session = parseSession(ownValue(raw, 'session'));
  const status = parseStatus(ownValue(raw, 'status'));
  const fields = { documentId, title, fileName, path, format, savedAt, session, status };
  if (Object.values(fields).some((field) => field === undefined)) {
    return undefined;
  }
  const writeMs = wholeNumber(ownValue(raw, 'writeMs'), 0, MAX_WRITE_MS);
  return { version: MANIFEST_VERSION, ...(fields as Omit<AutosaveManifest, 'version' | 'writeMs'>), ...(writeMs === undefined ? {} : { writeMs }) };
}

/** A manifest file's text read back; undefined for anything that is not one this version wrote. */
export function parseManifest(text: string): AutosaveManifest | undefined {
  if (text.length > MAX_MANIFEST_LENGTH) {
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRawObject(raw) || ownValue(raw, 'version') !== MANIFEST_VERSION) {
    return undefined;
  }
  return readFields(raw);
}

/** The manifest file's text. */
export function manifestText(manifest: AutosaveManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
