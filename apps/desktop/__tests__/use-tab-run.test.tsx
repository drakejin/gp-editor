import { useReducer } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { type Song, type TranscribedTrack, buildSongFromTranscription } from '@gp-editor/core';
import { type RunGuard, type RunTask, type TabRun, useRunGuard, useTabRun } from '../src/hooks/use-tab-run';
import { INITIAL_WORKSPACE, type WorkspaceState, workspaceReducer } from '../src/state/workspace';

const GUITAR: TranscribedTrack = { name: 'Lead', instrument: 'guitar', tuning: [], capo: 0 };
const WORDING = { cancelled: () => 'stopped', changed: () => 'changed' };

function oneBar(): Song {
  return buildSongFromTranscription([{ tracks: [GUITAR], measures: [{ parts: [{ track: 0, beats: [{ duration: 'whole', notes: [{ string: 1, fret: 0 }] }] }] }] }]).song;
}

interface Probe {
  readonly first: () => TabRun<string>;
  readonly second: () => TabRun<string>;
  readonly guard: () => RunGuard;
}

/** Two runs on one window, as Compose from Here and AI Edit are, sharing one guard. */
function render(): Probe {
  const probe: { first?: TabRun<string>; second?: TabRun<string>; guard?: RunGuard } = {};
  function Host() {
    const [workspace, dispatch] = useReducer(workspaceReducer, INITIAL_WORKSPACE, (initial: WorkspaceState) =>
      workspaceReducer(initial, { type: 'loaded', document: { fileName: 'a.gp', path: '/a.gp', song: oneBar() } }),
    );
    const guard = useRunGuard();
    probe.guard = guard;
    probe.first = useTabRun<string>(workspace, dispatch, WORDING, { owner: 'compose', guard });
    probe.second = useTabRun<string>(workspace, dispatch, WORDING, { owner: 'aiEdit', guard });
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
  return { first: () => required(probe.first), second: () => required(probe.second), guard: () => required(probe.guard) };
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 3; tick++) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

const failing = (message: string): RunTask<string> => () => Promise.resolve(() => ({ kind: 'failed', message }));

describe('useTabRun', () => {
  it('fails a task that throws before it returns, and can run again', async () => {
    // Arrange
    const probe = render();
    const throwing: RunTask<string> = () => {
      throw new Error('boom');
    };

    // Act
    ReactTestRenderer.act(() => probe.first().start(throwing));
    await flush();
    const afterThrow = probe.first().status;
    ReactTestRenderer.act(() => probe.first().start(failing('second run')));
    await flush();

    // Assert
    expect(afterThrow).toEqual({ kind: 'failed', message: 'boom' });
    expect(probe.first().status).toEqual({ kind: 'failed', message: 'second run' });
  });

  it('runs one AI Wizard run at a time: the other waits, says so, and can run once the first is done', async () => {
    // Arrange
    const probe = render();
    let finish: () => void = () => undefined;
    const slow: RunTask<string> = () => new Promise((resolve) => (finish = () => resolve(() => ({ kind: 'failed', message: 'first done' }))));
    const secondTask = jest.fn(failing('second done'));

    // Act
    ReactTestRenderer.act(() => probe.first().start(slow));
    await flush();
    ReactTestRenderer.act(() => probe.second().start(secondTask));
    const whileFirstRuns = probe.second().status;
    ReactTestRenderer.act(() => finish());
    await flush();
    ReactTestRenderer.act(() => probe.second().start(secondTask));
    await flush();

    // Assert
    expect(whileFirstRuns).toEqual({ kind: 'elsewhere', isOtherTool: true });
    expect(secondTask).toHaveBeenCalledTimes(1);
    expect(probe.second().status).toEqual({ kind: 'failed', message: 'second done' });
    expect(probe.guard().holder).toBeUndefined();
  });

  it('keeps the guard while a stopped run’s answer is still coming', async () => {
    // Arrange
    const probe = render();
    let finish: () => void = () => undefined;
    const slow: RunTask<string> = () => new Promise((resolve) => (finish = () => resolve(() => ({ kind: 'failed', message: 'late' }))));

    // Act
    ReactTestRenderer.act(() => probe.first().start(slow));
    await flush();
    ReactTestRenderer.act(() => probe.first().cancel());
    const stopping = { first: probe.first().status, second: probe.second().status };
    ReactTestRenderer.act(() => finish());
    await flush();

    // Assert
    expect(stopping).toEqual({ first: { kind: 'stopping' }, second: { kind: 'elsewhere', isOtherTool: true } });
    expect(probe.first().status).toEqual({ kind: 'failed', message: 'stopped' });
    expect(probe.second().status).toEqual({ kind: 'idle' });
  });
});
