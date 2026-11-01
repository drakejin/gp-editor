import { useReducer } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { type Song, type TranscribedTrack, buildSongFromTranscription } from '@gp-editor/core';
import { type AiEdit, INITIAL_AI_EDIT_DRAFT, aiEditProblem, needsClaude, useAiEdit } from '../src/hooks/use-ai-edit';
import type { ApiResponse } from '../src/native/anthropic';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, activeEditor, workspaceReducer } from '../src/state/workspace';
import { streamedMessage, toolMessage } from '../test-support/message-stream';

const mockSend = jest.fn<Promise<ApiResponse>, [string]>();

jest.mock('../src/native/anthropic', () => ({
  sendMessages: (body: string) => mockSend(body),
}));

const GUITAR: TranscribedTrack = { name: 'Lead', instrument: 'guitar', tuning: [], capo: 0 };

/** Two bars of a guitar: F#4 G#4 A#4 F#4 on string 2 (frets 7, 9, 11, 7) in each. */
function line(): Song {
  const bar = { parts: [{ track: 0, beats: [7, 9, 11, 7].map((fret) => ({ duration: 'quarter' as const, notes: [{ string: 2, fret }] })) }] };
  return buildSongFromTranscription([{ tracks: [GUITAR], measures: [bar, bar] }]).song;
}

const at = (measureIndex: number, beatIndex: number) => ({ trackIndex: 0, measureIndex, beatIndex, voiceIndex: 0, string: 2 });

interface Probe {
  readonly aiEdit: () => AiEdit;
  readonly workspace: () => WorkspaceState;
  readonly dispatch: (action: WorkspaceAction) => void;
}

function render(song = line()): Probe {
  let aiEdit: AiEdit | undefined;
  let workspace: WorkspaceState | undefined;
  let dispatch: ((action: WorkspaceAction) => void) | undefined;
  function Host() {
    const [state, send] = useReducer(workspaceReducer, INITIAL_WORKSPACE, (initial) => {
      const loaded = workspaceReducer(initial, { type: 'loaded', document: { fileName: 'line.gp', path: '/line.gp', song } });
      return workspaceReducer(loaded, { type: 'placeCursor', cursor: at(0, 0) });
    });
    workspace = state;
    dispatch = send;
    aiEdit = useAiEdit({ workspace: state, dispatch: send });
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
  return { aiEdit: () => required(aiEdit), workspace: () => required(workspace), dispatch: (action) => ReactTestRenderer.act(() => required(dispatch)(action)) };
}

/** Lets the run's pauses (each a zero timeout) and the stream's promises go by. */
async function flush(ticks = 4): Promise<void> {
  for (let tick = 0; tick < ticks; tick++) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

const shown = (probe: Probe) => activeEditor(probe.workspace());
const frets = (song: Song | undefined) => song?.tracks[0]?.measures[0]?.beats.map((beat) => `${beat.voices[0]?.notes[0]?.string}/${beat.voices[0]?.notes[0]?.fret}`);

beforeEach(() => mockSend.mockReset());

describe('useAiEdit: the preset', () => {
  it('lowers the key and re-fingers at once, one undo step, without asking Claude', async () => {
    // Arrange
    const probe = render();
    const before = shown(probe).document?.song;
    ReactTestRenderer.act(() => probe.aiEdit().open());

    // Act
    ReactTestRenderer.act(() => probe.aiEdit().run('claude-opus-5-5'));
    await flush();

    // Assert: two semitones down is E4 F#4 G#4 E4 — open string 1, frets 2 and 4.
    expect(frets(shown(probe).document?.song)).toEqual(['1/0', '1/2', '1/4', '1/0']);
    expect(shown(probe).past).toEqual([before]);
    expect(mockSend).not.toHaveBeenCalled();
    expect(probe.aiEdit().status).toMatchObject({ kind: 'done', result: { summary: expect.stringMatching(/^Transposed 8 notes down 2 semitones\. · Fingering: 8 notes on other strings/) } });
  });

  it('asks Claude to polish when asked to, and rejects the note whose pitch Claude changed', async () => {
    // Arrange: Claude puts the first E4 on string 2 (fret 5) and gives the second note a wrong pitch.
    const beats = [
      { duration: 'quarter', notes: [{ string: 2, fret: 5 }] },
      { duration: 'quarter', notes: [{ string: 1, fret: 3 }] },
      { duration: 'quarter', notes: [{ string: 1, fret: 4 }] },
      { duration: 'quarter', notes: [{ string: 1, fret: 0 }] },
    ];
    mockSend.mockResolvedValue(streamedMessage(toolMessage('write_bars', { bars: [{ parts: [{ track: 0, beats }] }] })));
    const probe = render();
    ReactTestRenderer.act(() => {
      probe.aiEdit().open();
      probe.aiEdit().changeDraft({ target: 'selection', isPolished: true });
    });
    probe.dispatch({ type: 'selectTo', cursor: at(0, 3) });

    // Act
    ReactTestRenderer.act(() => probe.aiEdit().run('claude-opus-5-5'));
    await flush();

    // Assert
    expect(mockSend).toHaveBeenCalledTimes(1);
    // (The optimizer keeps F#4 at the 7th fret of string 2: the hand stays in 4th position for bar 2's F#4 there.)
    expect(frets(shown(probe).document?.song)).toEqual(['2/5', '2/7', '1/4', '1/0']);
    expect(probe.aiEdit().status).toMatchObject({ kind: 'done', result: { summary: expect.stringContaining('Claude: 1 of 1 suggested positions taken · 1 note rejected') } });
  });
});

describe('useAiEdit: an instruction', () => {
  it('writes Claude’s bars as one undo step and says what changed', async () => {
    // Arrange
    const whole = { parts: [{ track: 0, beats: [{ duration: 'whole', notes: [{ string: 1, fret: 5 }] }] }] };
    mockSend.mockResolvedValue(streamedMessage(toolMessage('write_bars', { bars: [whole, whole] })));
    const probe = render();
    const before = shown(probe).document?.song;
    ReactTestRenderer.act(() => {
      probe.aiEdit().open();
      probe.aiEdit().changeDraft({ kind: 'instruction', prompt: 'make the riff easier' });
    });

    // Act
    ReactTestRenderer.act(() => probe.aiEdit().run('claude-opus-5-5'));
    await flush();

    // Assert
    expect(shown(probe).past).toEqual([before]);
    expect(probe.aiEdit().status).toEqual({
      kind: 'done',
      result: { summary: 'Rewrote bars 1–2 · 2 bars changed · notes 8 → 2 · highest fret 11 → 5', detail: 'Claude read all 2 bars · 1000 tokens in, 200 out', warnings: [] },
    });
    expect(JSON.parse(mockSend.mock.calls[0]?.[0] ?? '{}')).toMatchObject({ model: 'claude-opus-5-5' });
  });

  it('drops the answer when stopped', async () => {
    // Arrange
    let answer: (response: ApiResponse) => void = () => undefined;
    mockSend.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const probe = render();
    const before = shown(probe).document?.song;
    ReactTestRenderer.act(() => probe.aiEdit().changeDraft({ kind: 'instruction', prompt: 'simpler' }));

    // Act
    ReactTestRenderer.act(() => probe.aiEdit().run('claude-opus-5-5'));
    ReactTestRenderer.act(() => probe.aiEdit().cancel());
    answer(streamedMessage(toolMessage('write_bars', { bars: [] })));
    await flush();

    // Assert
    expect(shown(probe).document?.song).toBe(before);
    expect(probe.aiEdit().status).toEqual({ kind: 'failed', message: 'Stopped — the score was not changed' });
  });
});

describe('useAiEdit: the draft', () => {
  it('opens on the selection when there is one, else on the current track, and keeps what was typed', () => {
    // Arrange
    const probe = render();

    // Act
    ReactTestRenderer.act(() => probe.aiEdit().open());
    const withoutSelection = probe.aiEdit().draft.target;
    ReactTestRenderer.act(() => probe.aiEdit().changeDraft({ prompt: 'twelfth position', target: 'song' }));
    ReactTestRenderer.act(() => probe.aiEdit().close());
    probe.dispatch({ type: 'selectTo', cursor: at(0, 2) });
    ReactTestRenderer.act(() => probe.aiEdit().open());

    // Assert
    expect(withoutSelection).toBe('track');
    expect(probe.aiEdit().draft).toMatchObject({ target: 'selection', prompt: 'twelfth position' });
  });

  it('needs Claude for an instruction or a polish only, and says what is missing', () => {
    // Assert
    expect(needsClaude(INITIAL_AI_EDIT_DRAFT)).toBe(false);
    expect(needsClaude({ ...INITIAL_AI_EDIT_DRAFT, isPolished: true })).toBe(true);
    expect(needsClaude({ ...INITIAL_AI_EDIT_DRAFT, kind: 'instruction' })).toBe(true);
    expect(aiEditProblem({ ...INITIAL_AI_EDIT_DRAFT, target: 'selection' }, false)).toBe('Select beats in the score, or choose the current track or all tracks');
    expect(aiEditProblem({ ...INITIAL_AI_EDIT_DRAFT, kind: 'instruction', prompt: '  ' }, true)).toBe('Write what Claude should change, or pick an idea');
    expect(aiEditProblem(INITIAL_AI_EDIT_DRAFT, false)).toBeUndefined();
  });
});
