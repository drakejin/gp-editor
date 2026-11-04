import { useCallback, useEffect, useRef, useState } from 'react';
import { clearApiKey, hasApiKey, saveModel, savedModel, sendMessages, setApiKey } from '../native/anthropic';
import {
  type ProjectEntry,
  choosePdf,
  createProject,
  listProjects,
  pdfPages,
  readProjectText,
  revealProject,
  writeProjectBase64,
  writeProjectText,
} from '../native/projects';
import { type ImportProject, PROJECT_FILE, newImportProject, parseImportProject, serializeImportProject } from '../pdf-import/project-file';
import { DEFAULT_TRANSCRIPTION_MODEL } from '../pdf-import/request';
import { runImport } from '../pdf-import/run-import';
import type { ImportDeps } from '../pdf-import/transcribe-page';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';
import { wait } from '../lib/wait';

/** A project folder and what its project.json says (undefined when it has none, e.g. made by hand). */
export interface ProjectSummary {
  readonly path: string;
  readonly name: string;
  readonly modified: number;
  readonly project?: ImportProject;
}

export interface PdfImport {
  /** The import running now or last run in this session, with its folder. */
  readonly current?: { readonly path: string; readonly project: ImportProject };
  readonly isRunning: boolean;
  /** Cancel was chosen while the import runs: it stops once the page being transcribed answers. */
  readonly isCancelling: boolean;
  readonly projects: readonly ProjectSummary[];
  /** Undefined until known. */
  readonly hasKey?: boolean;
  readonly model: string;
  /** What could not be done (no key, no folder…), for the banner. */
  readonly error?: string;
  /** Picks a PDF, makes its project and transcribes it. Asks for a key first (onNeedsKey) when there is none. */
  readonly start: () => void;
  /** The same for a PDF handed over like a song (dropped on the window, `open -a`). */
  readonly importPath: (pathOrUrl: string) => void;
  readonly resume: (path: string) => void;
  readonly cancel: () => void;
  readonly reveal: (path: string) => void;
  /** Saves the key; a PDF dropped or a project resumed while there was none is then imported (`onContinue`). */
  readonly saveKey: (key: string) => Promise<void>;
  /** The import settings closed without a key: the PDF or project waiting for one is let go. */
  readonly forgetPending: () => void;
  readonly removeKey: () => void;
  readonly chooseModel: (model: string) => void;
  readonly dismiss: () => void;
}

function toSummary(entry: ProjectEntry): ProjectSummary {
  return { path: entry.path, name: entry.name, modified: entry.modified, project: parseImportProject(entry.project) };
}

function importDeps(path: string, project: ImportProject): ImportDeps {
  return {
    send: sendMessages,
    pdfPage: (page) => pdfPages(path, project.sourceFile, page, page),
    readText: (file) => readProjectText(path, file),
    writeText: async (file, text) => {
      await writeProjectText(path, file, text);
    },
    writeBase64: async (file, base64) => {
      await writeProjectBase64(path, file, base64);
    },
    wait,
  };
}

type SetError = (error: string | undefined) => void;

const NO_CONTINUE = (): void => undefined;

/** The import projects in Documents/GP Editor Projects, listed at once and after each run. */
function useProjects(setError: SetError) {
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const refreshProjects = useCallback(() => {
    listProjects()
      .then((entries) => setProjects(entries.map(toSummary)))
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [setError]);
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);
  return { projects, refreshProjects };
}

/** The API key (whether one is set; never its text) and the model, kept by the native side. */
function useImportSettings(setError: SetError, onNeedsKey: () => void) {
  const [hasKey, setHasKey] = useState<boolean | undefined>(undefined);
  const [model, setModel] = useState(DEFAULT_TRANSCRIPTION_MODEL);
  useEffect(() => {
    hasApiKey().then(setHasKey).catch(() => setHasKey(false));
    savedModel().then((saved) => saved !== null && setModel(saved)).catch(() => undefined);
  }, []);
  // Asks the native side each time: a PDF handed over at launch arrives before the first check has answered.
  const ensureKey = useCallback(async () => {
    const isKeySet = await hasApiKey().catch(() => false);
    setHasKey(isKeySet);
    if (!isKeySet) {
      onNeedsKey();
    }
    return isKeySet;
  }, [onNeedsKey]);
  const saveKey = useCallback(async (key: string) => {
    await setApiKey(key);
    setHasKey(true);
  }, []);
  const removeKey = useCallback(() => {
    clearApiKey().then(() => setHasKey(false)).catch((reason: unknown) => setError(errorMessage(reason)));
  }, [setError]);
  const chooseModel = useCallback((next: string) => {
    setModel(next);
    saveModel(next).catch(() => undefined);
  }, []);
  return { hasKey, model, ensureKey, saveKey, removeKey, chooseModel };
}

/** One import run at a time: its project as it goes, Cancel, and the song opened when it is built. */
function useImportRun(onSongReady: (songPath: string) => void, refreshProjects: () => void, setError: SetError) {
  const [current, setCurrent] = useState<PdfImport['current']>(undefined);
  const [isRunning, setIsRunning] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const isCancelled = useRef(false);
  const run = useCallback(
    async (path: string, project: ImportProject) => {
      isCancelled.current = false;
      setIsCancelling(false);
      setIsRunning(true);
      setError(undefined);
      setCurrent({ path, project });
      try {
        const finished = await runImport(project, importDeps(path, project), {
          isCancelled: () => isCancelled.current,
          onProgress: (next) => setCurrent({ path, project: next }),
        });
        if (finished.songFile !== undefined && (finished.status === 'done' || finished.status === 'partial')) {
          onSongReady(`${path}/${finished.songFile}`);
        }
      } catch (reason: unknown) {
        setError(errorMessage(reason));
      } finally {
        setIsRunning(false);
        setIsCancelling(false);
        refreshProjects();
      }
    },
    [onSongReady, refreshProjects, setError],
  );
  // Said at once (the banner): the page in flight still answers, which can take minutes with a long page.
  const cancel = useCallback(() => {
    isCancelled.current = true;
    setIsCancelling(true);
  }, []);
  return { current, setCurrent, isRunning, isCancelling, run, cancel };
}

/** Runs one import job at a time: a job asked for while another runs is refused with a message. */
function useExclusive(setError: SetError): (job: () => Promise<void>) => void {
  // Set from the moment an import or resume is asked for (key check, open panel…) until its run ends.
  const isBusy = useRef(false);
  return useCallback(
    (job: () => Promise<void>) => {
      if (isBusy.current) {
        setError(t('window.pdfImport.busy'));
        return;
      }
      isBusy.current = true;
      job()
        .catch((reason: unknown) => setError(errorMessage(reason)))
        .finally(() => {
          isBusy.current = false;
        });
    },
    [setError],
  );
}

/** A new project for the PDF `pick` gives (after the key check), transcribed at once. */
async function importNewProject(pick: () => Promise<string | null>, model: string, run: (path: string, project: ImportProject) => Promise<void>): Promise<void> {
  const pdfPath = await pick();
  if (pdfPath === null) {
    return;
  }
  const created = await createProject(pdfPath);
  const project = newImportProject(created, model, new Date());
  await writeProjectText(created.path, PROJECT_FILE, serializeImportProject(project));
  await run(created.path, project);
}

/** A project transcribed on from its project.json (the pages it has are kept), with the model chosen now. */
async function resumeProject(path: string, model: string, run: (path: string, project: ImportProject) => Promise<void>, setError: SetError): Promise<void> {
  const project = parseImportProject(await readProjectText(path, PROJECT_FILE).catch(() => null));
  if (project === undefined) {
    setError(t('window.pdfImport.noProject'));
    return;
  }
  await run(path, { ...project, model });
}

/** What waited for the key: a PDF handed over (dropped, `open -a`) or a project to resume. */
type PendingImport = { readonly pdf: string } | { readonly project: string };

/** Remembers the import that asked for a key; once the key is saved it goes on, unless the settings closed first. */
function usePendingImport(saveSettingsKey: (key: string) => Promise<void>, onContinue: () => void) {
  const pending = useRef<PendingImport | undefined>(undefined);
  const remember = useCallback((what: PendingImport) => {
    pending.current = what;
  }, []);
  const forgetPending = useCallback(() => {
    pending.current = undefined;
  }, []);
  const saveKey = useCallback(
    async (key: string, goOn: (what: PendingImport) => void) => {
      await saveSettingsKey(key);
      const what = pending.current;
      pending.current = undefined;
      if (what !== undefined) {
        onContinue();
        goOn(what);
      }
    },
    [saveSettingsKey, onContinue],
  );
  return { remember, forgetPending, saveKey };
}

/**
 * PDF → tab: every import is a project folder in Documents/GP Editor Projects, transcribed page by page by Claude
 * (runImport). When a song is built, `onSongReady` gets its path to open it. Without a key `onNeedsKey` asks for one; a
 * PDF handed over or a project resumed meanwhile goes on once it is saved (`onContinue` first).
 */
export function usePdfImport(onSongReady: (songPath: string) => void, onNeedsKey: () => void, onContinue: () => void = NO_CONTINUE): PdfImport {
  const [error, setError] = useState<string | undefined>(undefined);
  const { projects, refreshProjects } = useProjects(setError);
  const settings = useImportSettings(setError, onNeedsKey);
  const { current, setCurrent, isRunning, isCancelling, run, cancel } = useImportRun(onSongReady, refreshProjects, setError);
  const exclusive = useExclusive(setError);
  const waiting = usePendingImport(settings.saveKey, onContinue);
  const { ensureKey, model } = settings;
  const { remember } = waiting;
  const importFrom = useCallback(
    (pick: () => Promise<string | null>, pdf?: string) =>
      exclusive(async () => {
        try {
          if (await ensureKey()) {
            await importNewProject(pick, model, run);
          } else if (pdf !== undefined) {
            remember({ pdf });
          }
        } catch (reason: unknown) {
          setError(errorMessage(reason));
        }
      }),
    [exclusive, ensureKey, model, run, remember],
  );
  const start = useCallback(() => importFrom(async () => (await choosePdf())?.path ?? null), [importFrom]);
  const importPath = useCallback((pathOrUrl: string) => importFrom(async () => pathOrUrl, pathOrUrl), [importFrom]);
  const resume = useCallback(
    (path: string) =>
      exclusive(async () => {
        if (await ensureKey()) {
          await resumeProject(path, model, run, setError);
        } else {
          remember({ project: path });
        }
      }),
    [exclusive, ensureKey, model, run, remember],
  );
  const reveal = useCallback((path: string) => {
    revealProject(path).catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);
  const dismiss = useCallback(() => {
    setError(undefined);
    setCurrent(undefined);
  }, [setCurrent]);
  const saveKey = useCallback((key: string) => waiting.saveKey(key, (what) => ('pdf' in what ? importPath(what.pdf) : resume(what.project))), [waiting, importPath, resume]);
  const { hasKey, removeKey, chooseModel } = settings;
  const { forgetPending } = waiting;
  return { current, isRunning, isCancelling, projects, hasKey, model, error, start, importPath, resume, cancel, reveal, saveKey, forgetPending, removeKey, chooseModel, dismiss };
}
