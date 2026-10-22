import { type TranscriptionPage, buildSongFromTranscription, parseTranscriptionPage, writeSong } from '@gp-editor/core';
import { bytesToBase64 } from '../lib/base64';
import { type ImportProject, PROJECT_FILE, type PageFailure, pageFile, serializeImportProject } from './project-file';
import { type ImportDeps, type PageResult, addUsage, transcribePage } from './transcribe-page';

export interface ImportOptions {
  /** Checked before each page; a cancelled import keeps the pages it has. */
  readonly isCancelled: () => boolean;
  readonly onProgress: (project: ImportProject) => void;
}

/** Pages transcribed at the same time after the first. */
const PAGE_CONCURRENCY = 3;

/** The run's state, saved to project.json after every change (one write at a time). */
interface Run {
  project: ImportProject;
  readonly pages: Map<number, TranscriptionPage>;
  saving: Promise<void>;
  isStopped: boolean;
}

function update(run: Run, change: Partial<ImportProject>, deps: ImportDeps, options: ImportOptions): Promise<void> {
  run.project = { ...run.project, ...change };
  const snapshot = run.project;
  options.onProgress(snapshot);
  run.saving = run.saving.then(() => deps.writeText(PROJECT_FILE, serializeImportProject(snapshot)));
  return run.saving;
}

/** Pages saved by an earlier run of this project (a resumed import only asks for the rest). */
async function savedPages(project: ImportProject, deps: ImportDeps): Promise<Map<number, TranscriptionPage>> {
  const pages = new Map<number, TranscriptionPage>();
  for (const page of project.pagesDone) {
    try {
      const text = await deps.readText(pageFile(page));
      if (text !== null) {
        pages.set(page, parseTranscriptionPage(JSON.parse(text) as unknown));
      }
    } catch {
      // An unreadable saved page is simply transcribed again.
    }
  }
  return pages;
}

/**
 * Saves a page's outcome. The page file is written first; the project is then read and changed with no await in
 * between, since pages finish concurrently and a change computed before an await would drop another page's.
 */
async function record(run: Run, page: number, result: PageResult, deps: ImportDeps, options: ImportOptions): Promise<void> {
  if (result.isOk) {
    run.pages.set(page, result.page);
    await deps.writeText(pageFile(page), `${JSON.stringify(result.page, null, 2)}\n`);
  }
  const { project } = run;
  const usage = addUsage(project.usage, result.usage);
  const failedPages = project.failedPages.filter((failure) => failure.page !== page);
  if (!result.isOk) {
    run.isStopped = run.isStopped || result.isFatal;
    const failure: PageFailure = { page, message: result.message };
    await update(run, { usage, failedPages: [...failedPages, failure], error: result.isFatal ? result.message : project.error }, deps, options);
    return;
  }
  const pagesDone = [...new Set([...project.pagesDone, page])].sort((a, b) => a - b);
  await update(run, { usage, failedPages, pagesDone }, deps, options);
}

async function transcribeRest(run: Run, missing: readonly number[], deps: ImportDeps, options: ImportOptions): Promise<void> {
  const queue = [...missing];
  const worker = async (): Promise<void> => {
    for (let page = queue.shift(); page !== undefined; page = queue.shift()) {
      if (run.isStopped || options.isCancelled()) {
        return;
      }
      await record(run, page, await transcribePage(run.project, page, run.pages.get(1), deps), deps, options);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, queue.length) }, worker));
}

/** The song from the pages in order, saved as <name>.gp5 next to them; the project says how it went. */
async function finish(run: Run, deps: ImportDeps, options: ImportOptions): Promise<void> {
  const ordered = [...run.pages.entries()].sort(([a], [b]) => a - b).map(([, page]) => page);
  if (options.isCancelled()) {
    await update(run, { status: 'cancelled' }, deps, options);
    return;
  }
  if (ordered.length === 0 || run.project.error !== undefined) {
    const error = run.project.error ?? run.project.failedPages[0]?.message ?? 'No page could be transcribed';
    await update(run, { status: 'failed', error }, deps, options);
    return;
  }
  const { song, warnings } = buildSongFromTranscription(ordered, { title: run.project.name });
  const songFile = `${run.project.name}.gp5`;
  await deps.writeBase64(songFile, bytesToBase64(writeSong(song, 'gp5')));
  const missing = run.project.failedPages.map((failure) => `Page ${failure.page} was not transcribed: ${failure.message}`);
  const status = run.project.failedPages.length > 0 ? 'partial' : 'done';
  await update(run, { status, songFile, warnings: [...missing, ...warnings], error: undefined }, deps, options);
}

/**
 * Transcribes the project's PDF page by page with the model and builds the song. Page 1 goes first (it names the song
 * and its tracks); the others follow, three at a time, with page 1 as their context. Pages already saved are kept, so
 * the same call resumes an unfinished or partly failed project. A refused key or an empty credit balance stops it.
 */
export async function runImport(start: ImportProject, deps: ImportDeps, options: ImportOptions): Promise<ImportProject> {
  const run: Run = { project: start, pages: await savedPages(start, deps), saving: Promise.resolve(), isStopped: false };
  await update(run, { status: 'transcribing', error: undefined, pagesDone: [...run.pages.keys()].sort((a, b) => a - b) }, deps, options);
  if (!run.pages.has(1) && !options.isCancelled()) {
    await record(run, 1, await transcribePage(run.project, 1, undefined, deps), deps, options);
  }
  if (run.pages.has(1)) {
    const missing = Array.from({ length: run.project.pageCount }, (_, i) => i + 1).filter((page) => !run.pages.has(page));
    await transcribeRest(run, missing, deps, options);
  }
  await finish(run, deps, options);
  await run.saving;
  return run.project;
}
