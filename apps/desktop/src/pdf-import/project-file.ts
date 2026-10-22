import type { CreatedProject } from '../native/projects';
import type { TokenUsage } from './response';

/** Where an import stands: still running, finished (every page, or some failed), stopped by an error, or cancelled. */
export type ImportStatus = 'transcribing' | 'done' | 'partial' | 'failed' | 'cancelled';

const IMPORT_STATUSES: readonly ImportStatus[] = ['transcribing', 'done', 'partial', 'failed', 'cancelled'];

export interface PageFailure {
  /** 1-based. */
  readonly page: number;
  readonly message: string;
}

/** project.json of an import project (next to the PDF, the page transcriptions in pages/, and the .gp5). */
export interface ImportProject {
  readonly version: 1;
  readonly name: string;
  /** The PDF copy in the project. */
  readonly sourceFile: string;
  readonly pageCount: number;
  readonly model: string;
  /** ISO 8601. */
  readonly createdAt: string;
  readonly status: ImportStatus;
  /** 1-based pages whose transcription is saved. */
  readonly pagesDone: readonly number[];
  readonly failedPages: readonly PageFailure[];
  /** The .gp5 built from the pages, once there is one. */
  readonly songFile?: string;
  readonly warnings: readonly string[];
  readonly usage: TokenUsage;
  /** Why the import stopped, when it did. */
  readonly error?: string;
}

export const PROJECT_FILE = 'project.json';

export function newImportProject(created: CreatedProject, model: string, now: Date): ImportProject {
  return {
    version: 1,
    name: created.name,
    sourceFile: created.sourceFile,
    pageCount: created.pageCount,
    model,
    createdAt: now.toISOString(),
    status: 'transcribing',
    pagesDone: [],
    failedPages: [],
    warnings: [],
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

/** pages/page-001.json … — zero-padded so they list in page order. */
export function pageFile(page: number): string {
  return `pages/page-${String(page).padStart(3, '0')}.json`;
}

export function serializeImportProject(project: ImportProject): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isFailureList(value: unknown): value is PageFailure[] {
  return Array.isArray(value) && value.every((item) => isRecord(item) && isCount(item.page) && typeof item.message === 'string');
}

function hasProjectShape(value: Record<string, unknown>): boolean {
  const { usage } = value;
  return (
    value.version === 1 && typeof value.name === 'string' && typeof value.sourceFile === 'string' && isCount(value.pageCount) &&
    typeof value.model === 'string' && typeof value.createdAt === 'string' && IMPORT_STATUSES.some((status) => status === value.status) &&
    Array.isArray(value.pagesDone) && value.pagesDone.every(isCount) && isFailureList(value.failedPages) && isStringList(value.warnings) &&
    isRecord(usage) && isCount(usage.inputTokens) && isCount(usage.outputTokens) &&
    (value.songFile === undefined || typeof value.songFile === 'string') && (value.error === undefined || typeof value.error === 'string')
  );
}

/** project.json as written by serializeImportProject; undefined for a missing, broken or unknown file. */
export function parseImportProject(text: string | null): ImportProject | undefined {
  if (text === null) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
  return isRecord(value) && hasProjectShape(value) ? (value as unknown as ImportProject) : undefined;
}
