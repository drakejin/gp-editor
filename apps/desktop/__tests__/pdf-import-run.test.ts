import { type TranscriptionPage, readSong } from '@gp-editor/core';
import { base64ToBytes } from '../src/lib/base64';
import type { ApiResponse } from '../src/native/anthropic';
import {
  type ImportProject,
  PROJECT_FILE,
  newImportProject,
  pageFile,
  parseImportProject,
} from '../src/pdf-import/project-file';
import { runImport } from '../src/pdf-import/run-import';
import type { ImportDeps } from '../src/pdf-import/transcribe-page';

const QUARTER_BAR = {
  parts: [
    {
      track: 0,
      beats: [1, 2, 3, 4].map(fret => ({
        duration: 'quarter',
        notes: [{ string: 1, fret }],
      })),
    },
  ],
};
const FIRST_PAGE = {
  song: { title: 'Etude', artist: 'Anon', tempo: 90 },
  tracks: [
    {
      name: 'Guitar',
      instrument: 'guitar',
      tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
      capo: 0,
    },
  ],
  measures: [
    { timeSignature: { numerator: 4, denominator: 4 }, ...QUARTER_BAR },
  ],
};
const LATER_PAGE = { measures: [QUARTER_BAR, QUARTER_BAR] };

function answer(
  input: unknown,
  usage = { input_tokens: 1000, output_tokens: 200 },
): ApiResponse {
  return {
    status: 200,
    body: JSON.stringify({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'record_transcription', input }],
      usage,
    }),
  };
}

function apiError(status: number, type: string, message: string): ApiResponse {
  return {
    status,
    body: JSON.stringify({ type: 'error', error: { type, message } }),
  };
}

interface Fake {
  readonly deps: ImportDeps;
  readonly files: Map<string, string>;
  readonly sent: string[];
  readonly waits: number[];
}

/** In-memory project files; `answers(page, attempt)` scripts the API. */
function fake(
  answers: (page: number, attempt: number) => ApiResponse,
  files = new Map<string, string>(),
): Fake {
  const sent: string[] = [];
  const waits: number[] = [];
  const attempts = new Map<number, number>();
  const deps: ImportDeps = {
    pdfPage: async page => `pdf-page-${page}`,
    send: async body => {
      sent.push(body);
      const page = Number(/"data":"pdf-page-(\d+)"/.exec(body)?.[1]);
      const attempt = attempts.get(page) ?? 0;
      attempts.set(page, attempt + 1);
      return answers(page, attempt);
    },
    readText: async file => files.get(file) ?? null,
    writeText: async (file, text) => {
      files.set(file, text);
    },
    writeBase64: async (file, base64) => {
      files.set(file, base64);
    },
    wait: async milliseconds => {
      waits.push(milliseconds);
    },
  };
  return { deps, files, sent, waits };
}

const OPTIONS = { isCancelled: () => false, onProgress: () => undefined };

function project(pageCount: number): ImportProject {
  return newImportProject(
    { path: '/p/Etude', name: 'Etude', sourceFile: 'Etude.pdf', pageCount },
    'claude-opus-5-5',
    new Date(0),
  );
}

describe('runImport', () => {
  it('transcribes every page, saves them, builds the song and records how it went', async () => {
    // Arrange
    const run = fake(page => answer(page === 1 ? FIRST_PAGE : LATER_PAGE));
    const progress: ImportProject[] = [];

    // Act
    const finished = await runImport(project(3), run.deps, {
      ...OPTIONS,
      onProgress: next => progress.push(next),
    });

    // Assert
    expect(finished).toMatchObject({
      status: 'done',
      pagesDone: [1, 2, 3],
      songFile: 'Etude.gp5',
      usage: { inputTokens: 3000, outputTokens: 600 },
    });
    expect(parseImportProject(run.files.get(PROJECT_FILE) ?? null)).toEqual(
      finished,
    );
    expect(JSON.parse(run.files.get(pageFile(2)) ?? '{}')).toMatchObject({
      measures: [{}, {}],
    });
    const song = readSong(base64ToBytes(run.files.get('Etude.gp5') ?? ''));
    expect(song.measureHeaders).toHaveLength(5);
    expect(song.info.title).toBe('Etude');
    expect(progress.length).toBeGreaterThan(3);
  });

  it('gives the later pages what page 1 found', async () => {
    const run = fake(page => answer(page === 1 ? FIRST_PAGE : LATER_PAGE));
    await runImport(project(2), run.deps, OPTIONS);
    const second = run.sent.find(body => body.includes('pdf-page-2')) ?? '';
    expect(second).toContain(
      'track 0: Guitar (guitar; E2 A2 D3 G3 B3 E4; capo 0)',
    );
  });

  it('backs off and asks again when the API is busy', async () => {
    const run = fake((page, attempt) =>
      attempt === 0
        ? apiError(529, 'overloaded_error', 'Overloaded')
        : answer(page === 1 ? FIRST_PAGE : LATER_PAGE),
    );
    const finished = await runImport(project(1), run.deps, OPTIONS);
    expect(finished.status).toBe('done');
    expect(run.waits).toEqual([2000]);
  });

  it('stops at once when the key or the account is refused', async () => {
    // Arrange
    const run = fake(() =>
      apiError(
        400,
        'invalid_request_error',
        'Your credit balance is too low to access the Anthropic API.',
      ),
    );

    // Act
    const finished = await runImport(project(4), run.deps, OPTIONS);

    // Assert
    expect(finished).toMatchObject({
      status: 'failed',
      error: 'Your credit balance is too low to access the Anthropic API.',
    });
    expect(run.sent).toHaveLength(1);
    expect(run.files.has('Etude.gp5')).toBe(false);
  });

  it('builds the song from the pages it has when a page fails, and says which page is missing', async () => {
    const tooLong = {
      status: 200,
      body: JSON.stringify({
        stop_reason: 'max_tokens',
        content: [],
        usage: {},
      }),
    };
    const run = fake(page =>
      page === 2 ? tooLong : answer(page === 1 ? FIRST_PAGE : LATER_PAGE),
    );
    const finished = await runImport(project(3), run.deps, OPTIONS);
    expect(finished).toMatchObject({
      status: 'partial',
      pagesDone: [1, 3],
      failedPages: [{ page: 2 }],
      songFile: 'Etude.gp5',
    });
    expect(finished.warnings[0]).toContain('Page 2 was not transcribed');
  });

  it('asks again when an answer does not fit the transcription format', async () => {
    const run = fake((page, attempt) =>
      answer(
        attempt === 0
          ? { measures: 'nope' }
          : page === 1
          ? FIRST_PAGE
          : LATER_PAGE,
      ),
    );
    const finished = await runImport(project(1), run.deps, OPTIONS);
    expect(finished.status).toBe('done');
    expect(run.sent).toHaveLength(2);
  });

  it('resumes a project: saved pages are kept and only the missing ones are sent', async () => {
    // Arrange
    const files = new Map([
      [pageFile(1), JSON.stringify(FIRST_PAGE as TranscriptionPage)],
    ]);
    const run = fake(() => answer(LATER_PAGE), files);
    const started = {
      ...project(3),
      status: 'partial' as const,
      pagesDone: [1],
      failedPages: [{ page: 2, message: 'x' }],
    };

    // Act
    const finished = await runImport(started, run.deps, OPTIONS);

    // Assert
    expect(run.sent).toHaveLength(2);
    expect(run.sent.some(body => body.includes('pdf-page-1'))).toBe(false);
    expect(finished).toMatchObject({
      status: 'done',
      pagesDone: [1, 2, 3],
      failedPages: [],
    });
  });

  it('keeps what it has when cancelled', async () => {
    let isCancelled = false;
    const run = fake(page => {
      isCancelled = true;
      return answer(page === 1 ? FIRST_PAGE : LATER_PAGE);
    });
    const finished = await runImport(project(3), run.deps, {
      ...OPTIONS,
      isCancelled: () => isCancelled,
    });
    expect(finished).toMatchObject({ status: 'cancelled', pagesDone: [1] });
    expect(run.sent).toHaveLength(1);
  });
});
