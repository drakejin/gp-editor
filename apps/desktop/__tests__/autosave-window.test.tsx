// First: the native modules every src/native wrapper keeps when it loads.
import { answerNativeCalls, nativeCalls } from '../test-support/native-fakes';
import { DeviceEventEmitter } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { readSong, readSongFile, writeSong } from '@gp-editor/core';
import App from '../src/App';
import { type AutosaveManifest, manifestText, parseManifest } from '../src/autosave/autosave-manifest';
import { AUTOSAVE_IDLE_MS, AUTOSAVE_INTERVAL_MS } from '../src/autosave/autosave-schedule';
import { base64ToBytes, bytesToBase64 } from '../src/lib/base64';
import { HANDLED_KEYS } from '../src/lib/key-commands';
import { readFixture } from '../test-support/fixtures';

// The window as it runs, with autosave's native side answering: the question at launch about work a crash left
// unsaved, Restore, and an edited tab's snapshot 30 s later.

jest.mock('../src/native/specs/GPScoreCanvasNativeComponent', () => 'GPScoreCanvas');
jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));

const FILE_PATH = '/songs/nightwish.gp5';
const NIGHTWISH = readFixture('guitarpro5', 'nightwish.gp5');
/** Left by an app that crashed (pid 100, no longer running), never saved. */
const CRASHED: AutosaveManifest = {
  version: 1,
  documentId: '20261103-090000-abcd-tab-1',
  title: 'Nightwish',
  fileName: 'nightwish.gp5',
  path: FILE_PATH,
  format: 'gp5',
  savedAt: '2026-11-03T09:30:00.000Z',
  session: { id: '20261103-090000-abcd', pid: 100 },
  status: 'unsaved',
};
const FOLDER = `2026-11-03/${CRASHED.documentId}`;

/** What the autosave folder lists. */
let mockListed: readonly { folder: string; manifest: string }[] = [];

function autosaveAnswer(method: string): unknown {
  switch (method) {
    case 'sessionInfo':
      return Promise.resolve({ processId: 4242, bootId: 'BAA8756F-444D-4F6E-8783-5D2A67D4F287' });
    case 'removeDaysBefore':
      return Promise.resolve(0);
    case 'listSnapshots':
      return Promise.resolve(mockListed);
    case 'runningProcesses':
      return Promise.resolve([false]);
    case 'readSnapshot':
      return Promise.resolve(bytesToBase64(writeSong(readSong(NIGHTWISH), 'gp')));
    case 'writeSnapshot':
    case 'writeManifest':
      return Promise.resolve();
    default:
      return undefined;
  }
}

beforeAll(() =>
  answerNativeCalls((moduleName, method) => {
    if (moduleName === 'GPAutosave') {
      return autosaveAnswer(method);
    }
    return moduleName === 'GPFiles' && method === 'readFile' ? Promise.resolve({ name: 'nightwish.gp5', path: FILE_PATH, base64: bytesToBase64(NIGHTWISH) }) : undefined;
  }),
);

const mockOpenWindows: ReactTestRenderer.ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 10, 4, 10, 0, 0));
  nativeCalls.clear();
  mockListed = [{ folder: FOLDER, manifest: manifestText(CRASHED) }];
});

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mockOpenWindows.splice(0).forEach((renderer) => renderer.unmount());
  });
  jest.useRealTimers();
});

async function launch(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  mockOpenWindows.push(renderer);
  return renderer;
}

function propsOf(renderer: ReactTestRenderer.ReactTestRenderer, prop: string) {
  return renderer.root.findAll((node) => Object.prototype.hasOwnProperty.call(node.props, prop))[0]?.props;
}

function manifestsWritten(method: string): readonly AutosaveManifest[] {
  return (nativeCalls.get(`GPAutosave.${method}`) ?? []).flatMap((args) => parseManifest(String(args.at(-1))) ?? []);
}

describe('autosave in the window', () => {
  it('asks at launch whether to restore the work a crash left; Restore opens it edited, its snapshot this session’s', async () => {
    // Arrange
    const renderer = await launch();
    const question = propsOf(renderer, 'onRestoreAll');

    // Act
    await ReactTestRenderer.act(async () => question?.onRestoreAll());

    // Assert
    expect(question?.mode).toBe('launch');
    expect(question?.works.map((work: { documentId: string }) => work.documentId)).toEqual([CRASHED.documentId]);
    expect(propsOf(renderer, 'onRestoreAll')).toBeUndefined();
    expect(propsOf(renderer, 'activeTabId')?.tabs).toEqual([expect.objectContaining({ fileName: 'nightwish.gp5', isEdited: true })]);
    expect(manifestsWritten('writeManifest')).toEqual([expect.objectContaining({ documentId: CRASHED.documentId, status: 'unsaved', session: expect.objectContaining({ pid: 4242 }) })]);
  });

  it('asks nothing when the work was saved, and File ▸ Recover Autosaved Work… lists what is kept', async () => {
    // Arrange
    mockListed = [{ folder: FOLDER, manifest: manifestText({ ...CRASHED, status: 'declined' }) }];
    const renderer = await launch();
    const atLaunch = propsOf(renderer, 'onRestoreAll');

    // Act
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('recoverAutosaveRequested', {});
    });

    // Assert
    expect(atLaunch).toBeUndefined();
    expect(propsOf(renderer, 'onRestoreAll')?.mode).toBe('list');
    expect(propsOf(renderer, 'onRestoreAll')?.works).toHaveLength(1);
  });

  it('writes an edited tab’s snapshot once 30 s passed and the editing paused', async () => {
    // Arrange
    mockListed = [];
    const renderer = await launch();
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('fileOpened', { path: FILE_PATH });
    });
    const root = renderer.root.find((node) => node.props.keyDownEvents === HANDLED_KEYS);
    await ReactTestRenderer.act(async () => {
      root.props.onKeyDown({ nativeEvent: { key: '7', metaKey: false, shiftKey: false, altKey: false } });
    });

    // Act
    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS + AUTOSAVE_IDLE_MS);
    });

    // Assert
    const [folder, base64] = (nativeCalls.get('GPAutosave.writeSnapshot')?.[0] ?? []) as [string, string];
    expect(folder).toMatch(/^2026-11-04\/20261104-100000-[0-9a-z]{4}-tab-1$/);
    expect(readSongFile(base64ToBytes(base64)).song.tracks).toHaveLength(readSong(NIGHTWISH).tracks.length);
    expect(manifestsWritten('writeSnapshot')).toEqual([expect.objectContaining({ fileName: 'nightwish.gp5', path: FILE_PATH, status: 'unsaved' })]);
  });
});
