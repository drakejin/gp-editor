import {
  type Song,
  type TranscribedTrack,
  buildSongFromTranscription,
} from '@gp-editor/core';
import type { ComposeIdea } from '../src/compose/request';
import { type ComposeStep, runCompose } from '../src/compose/run-compose';
import type { ClaudeDeps } from '../src/lib/ask-tool';
import type { ApiResponse } from '../src/native/anthropic';
import {
  type EditorState,
  INITIAL_EDITOR_STATE,
  editorReducer,
} from '../src/state/editor';
import {
  cutStream,
  streamedMessage,
  toolMessage,
} from '../test-support/message-stream';

const GUITAR: TranscribedTrack = {
  name: 'Lead',
  instrument: 'guitar',
  tuning: [],
  capo: 0,
};
const BASS: TranscribedTrack = {
  name: 'Bass',
  instrument: 'bass',
  tuning: [],
  capo: 0,
};

/** Two bars, guitar and bass, a whole note each. */
function duo(): Song {
  const whole = (track: number, string: number) => ({
    track,
    beats: [{ duration: 'whole' as const, notes: [{ string, fret: 3 }] }],
  });
  return buildSongFromTranscription([
    {
      tracks: [GUITAR, BASS],
      measures: [
        { parts: [whole(0, 1), whole(1, 4)] },
        { parts: [whole(0, 1), whole(1, 4)] },
      ],
    },
  ]).song;
}

const IDEA: ComposeIdea = {
  prompt: 'drums: half-time groove, add a bass line',
  startIndex: 1,
  scope: 'all',
  trackIndex: 0,
  allowsNewTracks: true,
};

const groove = {
  track: 2,
  beats: [
    { duration: 'half', notes: [{ drum: 'Bass Drum 1' }] },
    { duration: 'half', notes: [{ drum: 'Acoustic Snare' }] },
  ],
};
/** Three bars from bar 2 (one past the end), a new drum track, the bass rewritten. */
const ANSWER = {
  newTracks: [{ name: 'Drums', instrument: 'drums' }],
  bars: [
    {
      parts: [
        groove,
        {
          track: 1,
          beats: [{ duration: 'whole', notes: [{ string: 4, fret: 5 }] }],
        },
      ],
    },
    { parts: [groove] },
    { tempo: 80, parts: [groove] },
  ],
  warnings: ['kept the guitar as it was'],
};

function deps(send: ClaudeDeps['send'], isCancelled = () => false): ClaudeDeps {
  return { send, wait: () => Promise.resolve(), isCancelled };
}

function loaded(song: Song): EditorState {
  return editorReducer(INITIAL_EDITOR_STATE, {
    type: 'loaded',
    document: { fileName: 'duo.gp', path: '/duo.gp', song },
  });
}

describe('runCompose', () => {
  it('asks Claude once with the score and reads its streamed write_bars answer, checked against the scope', async () => {
    // Arrange
    const sent: string[] = [];
    const steps: ComposeStep[] = [];
    const send = jest.fn(async (body: string): Promise<ApiResponse> => {
      sent.push(body);
      return streamedMessage(toolMessage('write_bars', ANSWER), { chunk: 13 });
    });

    // Act
    const result = await runCompose(
      duo(),
      IDEA,
      'claude-opus-5-5',
      deps(send),
      step => steps.push(step),
    );

    // Assert
    expect(result.isOk).toBe(true);
    if (!result.isOk) {
      return;
    }
    expect(result.composed.bars).toHaveLength(3);
    expect(result.composed.newTracks).toEqual([
      { name: 'Drums', instrument: 'drums', tuning: [], capo: 0 },
    ]);
    expect(result.composed.warnings).toEqual(['kept the guitar as it was']);
    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 200 });
    expect(result.score.isSummarized).toBe(false);
    expect(steps).toEqual([{ kind: 'asking', attempt: 1 }]);
    const request = JSON.parse(sent[0] ?? '{}') as {
      tools: { name: string }[];
      messages: { content: { text: string }[] }[];
    };
    expect(request.tools.map(tool => tool.name)).toEqual(['write_bars']);
    expect(request.messages[0]?.content[0]?.text).toContain(
      '<user_request>\ndrums: half-time groove, add a bass line\n</user_request>',
    );
  });

  it('applied, writes the bars as one undo step that undo takes back exactly, and redo brings back', async () => {
    // Arrange
    const song = duo();
    const state = loaded(song);
    const result = await runCompose(
      song,
      IDEA,
      'claude-opus-5-5',
      deps(async () => streamedMessage(toolMessage('write_bars', ANSWER))),
      () => undefined,
    );
    if (!result.isOk) {
      throw new Error(result.message);
    }

    // Act
    const composed = editorReducer(state, {
      type: 'applyComposedBars',
      basis: song,
      composed: result.composed,
      startIndex: IDEA.startIndex,
    });
    const undone = editorReducer(composed, { type: 'undo' });
    const redone = editorReducer(undone, { type: 'redo' });

    // Assert
    const written = composed.document?.song;
    expect(written?.measureHeaders).toHaveLength(4);
    expect(written?.measureHeaders[3]?.tempo).toBe(80);
    expect(written?.tracks.map(track => track.name)).toEqual([
      'Lead',
      'Bass',
      'Drums',
    ]);
    expect(written?.tracks[0]?.measures[1]).toBe(song.tracks[0]?.measures[1]);
    expect(
      written?.tracks[1]?.measures[1]?.beats[0]?.voices[0]?.notes[0]?.fret,
    ).toBe(5);
    expect(composed.past).toEqual([song]);
    expect(composed.hint).toContain('Composed 3 bars from bar 2');
    expect(composed.trackDisplay.trackModes[2]).toBe('notation');
    expect(undone.document?.song).toBe(song);
    expect(undone.trackIndex).toBe(state.trackIndex);
    expect(undone.cursor).toEqual(state.cursor);
    expect(redone.document?.song).toBe(written);
  });

  it('refuses to apply bars written for a score that has changed since', async () => {
    // Arrange
    const song = duo();
    const edited = editorReducer(loaded(song), {
      type: 'setTrackName',
      trackIndex: 0,
      name: 'Solo',
    });

    // Act
    const next = editorReducer(edited, {
      type: 'applyComposedBars',
      basis: song,
      composed: { bars: [{ parts: [] }], newTracks: [], warnings: [] },
      startIndex: 0,
    });

    // Assert
    expect(next.document?.song).toBe(edited.document?.song);
    expect(next.past).toBe(edited.past);
    expect(next.hint).toBe(
      'The score changed while Claude was writing, so nothing was changed. Compose again.',
    );
  });

  it('asks again when the stream is cut off, adding the tokens of both answers', async () => {
    // Arrange
    const steps: ComposeStep[] = [];
    const answers = [
      cutStream(toolMessage('write_bars', ANSWER), 6),
      streamedMessage(toolMessage('write_bars', ANSWER)),
    ];
    const send = jest.fn(
      async () =>
        answers.shift() ?? streamedMessage(toolMessage('write_bars', ANSWER)),
    );

    // Act
    const result = await runCompose(
      duo(),
      IDEA,
      'claude-opus-5-5',
      deps(send),
      step => steps.push(step),
    );

    // Assert
    expect(result.isOk).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(steps).toEqual([
      { kind: 'asking', attempt: 1 },
      { kind: 'asking', attempt: 2 },
    ]);
    expect(result.usage.inputTokens).toBe(2000);
  });

  it('leaves out parts for tracks outside the scope, and new tracks when they are not allowed, with warnings', async () => {
    // Act
    const result = await runCompose(
      duo(),
      { ...IDEA, scope: 'track', allowsNewTracks: false },
      'claude-opus-5-5',
      deps(async () => streamedMessage(toolMessage('write_bars', ANSWER))),
      () => undefined,
    );

    // Assert
    expect(
      result.isOk && result.composed.bars.map(bar => bar.parts.length),
    ).toEqual([0, 0, 0]);
    expect(result.isOk && result.composed.warnings).toEqual([
      'kept the guitar as it was',
      'New tracks were not allowed: 1 new track left out',
      'Track 3: its parts in 3 bars were left out (no such track)',
      'Track 2 (Bass): its parts in 1 bar were left out (not one of the tracks to write)',
    ]);
  });

  it('fails with Claude’s reasons when it writes no bars, and after three answers that do not fit', async () => {
    // Act
    const empty = await runCompose(
      duo(),
      IDEA,
      'claude-opus-5-5',
      deps(async () =>
        streamedMessage(
          toolMessage('write_bars', {
            bars: [],
            warnings: ['The score has no melody to answer.'],
          }),
        ),
      ),
      () => undefined,
    );
    const broken = await runCompose(
      duo(),
      IDEA,
      'claude-opus-5-5',
      deps(async () =>
        streamedMessage(
          toolMessage('write_bars', {
            bars: [{ parts: [{ track: 0, beats: [{}] }] }],
          }),
        ),
      ),
      () => undefined,
    );

    // Assert
    expect(empty).toMatchObject({
      isOk: false,
      message: 'Claude wrote no bars: The score has no melody to answer.',
    });
    expect(broken.isOk).toBe(false);
    expect(!broken.isOk && broken.message).toMatch(
      /^The answer did not fit the format: bars\[0\]\.parts\[0\]\.beats\[0\]\.duration/,
    );
  });

  it('stops at once for a refused key, and when cancelled', async () => {
    // Arrange
    const refused = jest.fn(
      async (): Promise<ApiResponse> => ({
        status: 401,
        body: JSON.stringify({
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        }),
      }),
    );

    // Act
    const keyResult = await runCompose(
      duo(),
      IDEA,
      'claude-opus-5-5',
      deps(refused),
      () => undefined,
    );
    const cancelled = await runCompose(
      duo(),
      IDEA,
      'claude-opus-5-5',
      deps(refused, () => true),
      () => undefined,
    );

    // Assert
    expect(refused).toHaveBeenCalledTimes(1);
    expect(keyResult.isOk).toBe(false);
    expect(!keyResult.isOk && keyResult.message).toContain('invalid x-api-key');
    expect(cancelled).toMatchObject({
      isOk: false,
      message: 'Stopped — the score was not changed',
    });
  });
});
