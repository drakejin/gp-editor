import { useReducer } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  type Song,
  type TranscribedTrack,
  buildSongFromTranscription,
} from '@gp-editor/core';
import {
  type Compose,
  INITIAL_COMPOSE_DRAFT,
  composeIdeaOf,
  useCompose,
} from '../src/hooks/use-compose';
import type { ApiResponse } from '../src/native/anthropic';
import {
  INITIAL_WORKSPACE,
  type WorkspaceAction,
  type WorkspaceState,
  activeEditor,
  workspaceReducer,
} from '../src/state/workspace';
import { streamedMessage, toolMessage } from '../test-support/message-stream';

const mockSend = jest.fn<Promise<ApiResponse>, [string]>();

jest.mock('../src/native/anthropic', () => ({
  sendMessages: (body: string) => mockSend(body),
}));

const GUITAR: TranscribedTrack = {
  name: 'Lead',
  instrument: 'guitar',
  tuning: [],
  capo: 0,
};

/** Four bars of a guitar, a whole note in each. */
function fourBars(): Song {
  const bar = {
    parts: [
      {
        track: 0,
        beats: [
          { duration: 'whole' as const, notes: [{ string: 1, fret: 0 }] },
        ],
      },
    ],
  };
  return buildSongFromTranscription([
    { tracks: [GUITAR], measures: [bar, bar, bar, bar] },
  ]).song;
}

const ANSWER = {
  bars: [
    {
      parts: [
        {
          track: 0,
          beats: [{ duration: 'whole', notes: [{ string: 1, fret: 12 }] }],
        },
      ],
    },
  ],
};

interface Probe {
  readonly compose: () => Compose;
  readonly workspace: () => WorkspaceState;
  readonly dispatch: (action: WorkspaceAction) => void;
}

function render(song = fourBars()): Probe {
  let compose: Compose | undefined;
  let workspace: WorkspaceState | undefined;
  let dispatch: ((action: WorkspaceAction) => void) | undefined;
  function Host() {
    const [state, send] = useReducer(
      workspaceReducer,
      INITIAL_WORKSPACE,
      initial => {
        const loaded = workspaceReducer(initial, {
          type: 'loaded',
          document: { fileName: 'four.gp', path: '/four.gp', song },
        });
        return workspaceReducer(loaded, {
          type: 'placeCursor',
          cursor: {
            trackIndex: 0,
            measureIndex: 2,
            beatIndex: 0,
            voiceIndex: 0,
            string: 1,
          },
        });
      },
    );
    workspace = state;
    dispatch = send;
    compose = useCompose({ workspace: state, dispatch: send });
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Host />);
  });
  const required = <T,>(value: T | undefined): T => {
    if (value === undefined) {
      throw new Error('the hook did not run');
    }
    return value;
  };
  return {
    compose: () => required(compose),
    workspace: () => required(workspace),
    dispatch: action => ReactTestRenderer.act(() => required(dispatch)(action)),
  };
}

async function flush(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

const shownSong = (probe: Probe) =>
  activeEditor(probe.workspace()).document?.song;

beforeEach(() => mockSend.mockReset());

describe('useCompose', () => {
  it('opens at the cursor’s bar and keeps the draft when it closes', () => {
    // Arrange
    const probe = render();

    // Act
    ReactTestRenderer.act(() => {
      probe.compose().open();
      probe.compose().changeDraft({ prompt: 'a calm outro', scope: 'all' });
      probe.compose().close();
    });

    // Assert
    expect(probe.compose().isOpen).toBe(false);
    expect(probe.compose().draft).toMatchObject({
      startBar: 3,
      prompt: 'a calm outro',
      scope: 'all',
    });
  });

  it('writes Claude’s bars into the score as one undo step and shows what it wrote', async () => {
    // Arrange
    mockSend.mockResolvedValue(
      streamedMessage(toolMessage('write_bars', ANSWER)),
    );
    const probe = render();
    const before = shownSong(probe);
    ReactTestRenderer.act(() => probe.compose().open());

    // Act
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    expect(probe.compose().status).toMatchObject({
      kind: 'running',
      attempt: 1,
    });
    await flush();

    // Assert
    const editor = activeEditor(probe.workspace());
    expect(
      editor.document?.song.tracks[0]?.measures[2]?.beats[0]?.voices[0]
        ?.notes[0]?.fret,
    ).toBe(12);
    expect(editor.past).toEqual([before]);
    expect(probe.compose().status).toEqual({
      kind: 'done',
      result: {
        summary: 'Composed 1 bar from bar 3 · 1 note',
        reading: 'Claude read all 4 bars',
        warnings: [],
        usage: { inputTokens: 1000, outputTokens: 200 },
      },
    });
    expect(JSON.parse(mockSend.mock.calls[0]?.[0] ?? '{}')).toMatchObject({
      model: 'claude-opus-5-5',
    });
  });

  it('drops the answer when stopped, leaving the score as it was', async () => {
    // Arrange
    let answer: (response: ApiResponse) => void = () => undefined;
    mockSend.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const probe = render();
    const before = shownSong(probe);

    // Act
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    ReactTestRenderer.act(() => probe.compose().cancel());
    answer(streamedMessage(toolMessage('write_bars', ANSWER)));
    await flush();

    // Assert
    expect(shownSong(probe)).toBe(before);
    expect(probe.compose().status).toEqual({
      kind: 'failed',
      message: 'Stopped — the score was not changed',
    });
  });

  it('hides its panel for another AI Wizard panel without stopping the run: the bars are still written', async () => {
    // Arrange
    let answer: (response: ApiResponse) => void = () => undefined;
    mockSend.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const probe = render();
    ReactTestRenderer.act(() => probe.compose().open());
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));

    // Act
    ReactTestRenderer.act(() => probe.compose().hide());
    const whileHidden = probe.compose().status.kind;
    answer(streamedMessage(toolMessage('write_bars', ANSWER)));
    await flush();

    // Assert
    expect(probe.compose().isOpen).toBe(false);
    expect(whileHidden).toBe('running');
    expect(
      shownSong(probe)?.tracks[0]?.measures[2]?.beats[0]?.voices[0]?.notes[0]
        ?.fret,
    ).toBe(12);
  });

  it('shows its run going on when opened again while hidden', () => {
    // Arrange
    mockSend.mockReturnValue(new Promise(() => undefined));
    const probe = render();
    ReactTestRenderer.act(() => probe.compose().open());
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    ReactTestRenderer.act(() => probe.compose().hide());

    // Act
    ReactTestRenderer.act(() => probe.compose().open());

    // Assert
    expect(probe.compose().isOpen).toBe(true);
    expect(probe.compose().status.kind).toBe('running');
  });

  it('writes nothing when the score changed while Claude was writing', async () => {
    // Arrange
    let answer: (response: ApiResponse) => void = () => undefined;
    mockSend.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const probe = render();

    // Act
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    probe.dispatch({ type: 'setTrackName', trackIndex: 0, name: 'Solo' });
    const edited = shownSong(probe);
    answer(streamedMessage(toolMessage('write_bars', ANSWER)));
    await flush();

    // Assert
    expect(shownSong(probe)).toBe(edited);
    expect(probe.compose().status).toMatchObject({
      kind: 'failed',
      message:
        'The score changed while Claude was writing, so nothing was changed. Compose again.',
    });
  });

  it('shows why a run failed', async () => {
    // Arrange
    mockSend.mockResolvedValue({
      status: 400,
      body: JSON.stringify({
        error: { type: 'invalid_request_error', message: 'prompt is too long' },
      }),
    });
    const probe = render();

    // Act
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    await flush();

    // Assert
    expect(probe.compose().status).toEqual({
      kind: 'failed',
      message: 'prompt is too long',
    });
  });
});

describe('useCompose: what a run may and may not do', () => {
  it('fails without writing or making an undo step when the answer gives the score nothing it can take', async () => {
    // Arrange: the scope is the guitar (track 1), the answer writes a track 2 the score does not have.
    mockSend.mockResolvedValue(streamedMessage(toolMessage('write_bars', { bars: [{ parts: [{ track: 1, beats: [{ duration: 'whole', notes: [{ string: 1, fret: 3 }] }] }] }] })));
    const probe = render();
    const before = shownSong(probe);

    // Act
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    await flush();

    // Assert
    expect(shownSong(probe)).toBe(before);
    expect(activeEditor(probe.workspace()).past).toEqual([]);
    expect(probe.compose().status).toEqual({ kind: 'failed', message: 'Claude wrote nothing the score could take: Track 2: its parts in 1 bar were left out (no such track)' });
  });

  it('shows a run and its result only in the tab it was started in', async () => {
    // Arrange
    let answer: (response: ApiResponse) => void = () => undefined;
    mockSend.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const probe = render();
    const first = probe.workspace().activeTabId ?? '';

    // Act
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    probe.dispatch({ type: 'loaded', document: { fileName: 'other.gp', path: '/other.gp', song: fourBars() } });
    const elsewhere = probe.compose().status;
    answer(streamedMessage(toolMessage('write_bars', ANSWER)));
    await flush();
    const inOther = probe.compose().status;
    probe.dispatch({ type: 'switchTab', tabId: first });

    // Assert
    expect(elsewhere).toEqual({ kind: 'elsewhere' });
    expect(inOther).toEqual({ kind: 'idle' });
    expect(probe.compose().status).toMatchObject({ kind: 'done' });
    expect(activeEditor(probe.workspace()).past).toHaveLength(1);
  });

  it('fails, ready to compose again, when asking throws', async () => {
    // Arrange
    mockSend.mockImplementation(() => {
      throw new Error('GPAnthropic native module is not available on this platform');
    });
    const probe = render();

    // Act
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    await flush();
    await flush();

    // Assert
    expect(probe.compose().status).toEqual({ kind: 'failed', message: 'GPAnthropic native module is not available on this platform' });
  });

  it('does not start another run while a stopped answer is still coming, and says it waits for it', async () => {
    // Arrange
    let answer: (response: ApiResponse) => void = () => undefined;
    mockSend.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const probe = render();

    // Act: stopped once the request is out.
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    await flush();
    ReactTestRenderer.act(() => probe.compose().cancel());
    const stopping = probe.compose().status;
    ReactTestRenderer.act(() => probe.compose().compose('claude-opus-5-5'));
    const sentWhileStopping = mockSend.mock.calls.length;
    answer(streamedMessage(toolMessage('write_bars', ANSWER)));
    await flush();

    // Assert
    expect(stopping).toEqual({ kind: 'stopping' });
    expect(sentWhileStopping).toBe(1);
    expect(probe.compose().status).toEqual({ kind: 'failed', message: 'Stopped — the score was not changed' });
  });
});

describe('composeIdeaOf', () => {
  it('keeps the start within the bars and one after them, and the bar limit within the tool’s', () => {
    // Arrange
    const song = fourBars();

    // Act / Assert
    expect(
      composeIdeaOf({ ...INITIAL_COMPOSE_DRAFT, startBar: 9 }, song, 0),
    ).toMatchObject({ startIndex: 4 });
    expect(
      composeIdeaOf({ ...INITIAL_COMPOSE_DRAFT, startBar: 0 }, song, 0),
    ).toMatchObject({ startIndex: 0 });
    expect(
      composeIdeaOf(INITIAL_COMPOSE_DRAFT, song, 0).maxBars,
    ).toBeUndefined();
    expect(
      composeIdeaOf(
        { ...INITIAL_COMPOSE_DRAFT, isLimited: true, barLimit: 500 },
        song,
        0,
      ).maxBars,
    ).toBe(64);
  });
});
