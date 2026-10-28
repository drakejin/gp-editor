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
import {
  cutStream,
  streamEndingInError,
  streamedMessage,
  toolMessage,
} from '../test-support/message-stream';

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

/** A band bar: a drum beat, two sung notes with their syllables, a guitar chord. */
function bandBar(syllables: readonly string[]) {
  const drums = [
    ['Bass Drum 1', 'Closed Hi-Hat'],
    ['Closed Hi-Hat'],
    ['Acoustic Snare', 'Closed Hi-Hat'],
    ['Closed Hi-Hat'],
  ];
  return {
    lyrics: syllables,
    parts: [
      {
        track: 0,
        beats: drums.map(names => ({
          duration: 'quarter',
          notes: names.map(drum => ({ drum })),
        })),
      },
      {
        track: 1,
        beats: ['G4', 'E4'].map(pitch => ({
          duration: 'half',
          notes: [{ pitch }],
        })),
      },
      {
        track: 2,
        beats: [
          {
            duration: 'whole',
            notes: [
              { string: 3, fret: 0 },
              { string: 2, fret: 1 },
            ],
          },
        ],
      },
    ],
  };
}
const BAND_FIRST_PAGE = {
  song: { title: 'Band', tempo: 100 },
  tracks: [
    { name: 'Drums', instrument: 'drums' },
    { name: 'Vocals', instrument: 'vocals', clef: 'treble' },
    { name: 'Guitar', instrument: 'guitar', tuning: [], capo: 0 },
  ],
  measures: [bandBar(['Hel-', 'lo'])],
};
const BAND_LATER_PAGE = { measures: [bandBar(['good', 'bye'])] };

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

  it('imports every staff of a band page: drums, vocals with their lyrics and a guitar', async () => {
    // Arrange
    const run = fake(page =>
      answer(page === 1 ? BAND_FIRST_PAGE : BAND_LATER_PAGE),
    );

    // Act
    const finished = await runImport(project(2), run.deps, OPTIONS);

    // Assert
    expect(finished).toMatchObject({ status: 'done', warnings: [] });
    const song = readSong(base64ToBytes(run.files.get('Etude.gp5') ?? ''));
    const [drums, vocals, guitar] = song.tracks;
    const channelOf = (channelId: number | undefined) =>
      song.channels.find(channel => channel.id === channelId);
    expect(song.tracks.map(track => track.name)).toEqual([
      'Drums',
      'Vocals',
      'Guitar',
    ]);
    expect(drums?.isPercussion).toBe(true);
    expect(channelOf(drums?.channelId)?.isPercussion).toBe(true);
    const drumKeys = drums?.measures.map(measure =>
      measure.beats.map(beat => beat.voices[0]?.notes.map(note => note.fret)),
    );
    expect(drumKeys?.[1]).toEqual([[42, 36], [42], [42, 38], [42]]);
    expect(channelOf(vocals?.channelId)?.program).toBe(53);
    const sung = vocals?.measures.flatMap(measure =>
      measure.beats.flatMap(beat =>
        (beat.voices[0]?.notes ?? []).map(
          note => (vocals.strings[note.string - 1]?.tuning ?? 0) + note.fret,
        ),
      ),
    );
    expect(sung).toEqual([67, 64, 67, 64]);
    expect(vocals?.lyrics).toEqual({ from: 1, text: 'Hel- lo good bye' });
    expect(guitar?.measures[0]?.beats[0]?.voices[0]?.notes).toHaveLength(2);
    const second = run.sent.find(body => body.includes('pdf-page-2')) ?? '';
    expect(second).toContain('track 0: Drums (drums)');
    expect(second).toContain('The lyrics are sung on track 1 (Vocals).');
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

  it('asks again when the model answers in text, counting the tokens of every attempt', async () => {
    // Arrange
    const inText: ApiResponse = {
      status: 200,
      body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is the page.' }], usage: { input_tokens: 1000, output_tokens: 30 } }),
    };
    const run = fake((page, attempt) => (attempt === 0 ? inText : answer(FIRST_PAGE)));

    // Act
    const finished = await runImport(project(1), run.deps, OPTIONS);

    // Assert
    expect(finished.status).toBe('done');
    expect(run.sent).toHaveLength(2);
    expect(finished.usage).toEqual({ inputTokens: 2000, outputTokens: 230 });
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

describe('runImport with streamed answers', () => {
  const streamed = (input: unknown) =>
    streamedMessage(
      toolMessage('record_transcription', input, {
        input_tokens: 1000,
        output_tokens: 200,
      }),
      { chunk: 9 },
    );

  it('builds the song from streamed pages, asking again for a page whose stream was cut off or ended in an error', async () => {
    // Arrange: page 2's stream stops half-way, then ends in overloaded_error, then arrives whole
    const page2 = toolMessage('record_transcription', BAND_LATER_PAGE);
    const run = fake((page, attempt) => {
      if (page === 1) {
        return streamed(BAND_FIRST_PAGE);
      }
      return [
        cutStream(page2, 12),
        streamEndingInError(page2, 20, 'overloaded_error', 'Overloaded'),
        streamed(BAND_LATER_PAGE),
      ][attempt] as ApiResponse;
    });

    // Act
    const finished = await runImport(project(2), run.deps, OPTIONS);

    // Assert
    expect(finished).toMatchObject({
      status: 'done',
      pagesDone: [1, 2],
      failedPages: [],
      usage: { inputTokens: 4000, outputTokens: 402 },
    });
    expect(run.waits).toEqual([2000, 4000]);
    expect(run.sent.every(body => JSON.parse(body).stream === true)).toBe(
      true,
    );
    const song = readSong(base64ToBytes(run.files.get('Etude.gp5') ?? ''));
    expect(song.tracks.map(track => track.name)).toEqual([
      'Drums',
      'Vocals',
      'Guitar',
    ]);
    expect(song.measureHeaders).toHaveLength(2);
  });

  it('records the page as failed when its streams keep being cut off', async () => {
    const run = fake(page =>
      page === 1
        ? streamed(FIRST_PAGE)
        : cutStream(toolMessage('record_transcription', LATER_PAGE), 5),
    );
    const finished = await runImport(project(2), run.deps, OPTIONS);
    expect(finished).toMatchObject({
      status: 'partial',
      pagesDone: [1],
      failedPages: [
        { page: 2, message: 'The answer stopped before it was complete' },
      ],
    });
  });
});
