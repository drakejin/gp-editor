// First: the native modules every src/native wrapper keeps when it loads.
import { answerNativeCalls, nativeCalls } from '../test-support/native-fakes';
import { DeviceEventEmitter } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';
import { bytesToBase64 } from '../src/lib/base64';
import { HANDLED_KEYS } from '../src/lib/key-commands';
import { readFixture } from '../test-support/fixtures';

// The window as it runs: App with every native module answering (menu events through the device event emitter, as
// the native side sends them), the score canvas drawn by nothing, and the player's position set by the test.

const FILE_PATH = '/songs/nightwish.gp5';

/** Where the player says it is. */
const mockPlayer = { seconds: 0 };

jest.mock('../src/native/specs/GPScoreCanvasNativeComponent', () => 'GPScoreCanvas');
jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));
jest.mock('../src/native/player', () => ({
  ...jest.requireActual('../src/native/player'),
  playMidi: () => Promise.resolve(),
  stopMidi: () => Promise.resolve(),
  setMutedTracks: () => Promise.resolve(),
  setClickTracks: () => Promise.resolve(),
  playerPosition: () => Promise.resolve({ seconds: mockPlayer.seconds, isPlaying: true }),
}));

beforeAll(() =>
  answerNativeCalls((moduleName, method) =>
    moduleName === 'GPFiles' && method === 'readFile'
      ? Promise.resolve({ name: 'nightwish.gp5', path: FILE_PATH, base64: bytesToBase64(readFixture('guitarpro5', 'nightwish.gp5')) })
      : undefined,
  ),
);

beforeEach(() => {
  jest.useFakeTimers();
  nativeCalls.clear();
  mockPlayer.seconds = 0;
});

afterEach(() => jest.useRealTimers());

/** The window with nightwish.gp5 opened from Finder and laid out at 1280 × 800, the cursor on its first beat. */
async function openWindow(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('fileOpened', { path: FILE_PATH });
  });
  await ReactTestRenderer.act(async () => {
    for (const node of renderer.root.findAll((candidate) => typeof candidate.props.onLayout === 'function')) {
      node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 1280, height: 800 } } });
    }
  });
  return renderer;
}

async function press(renderer: ReactTestRenderer.ReactTestRenderer, key: string, modifiers: { readonly metaKey?: boolean } = {}): Promise<void> {
  const root = renderer.root.find((node) => node.props.keyDownEvents === HANDLED_KEYS);
  await ReactTestRenderer.act(async () => {
    root.props.onKeyDown({ nativeEvent: { key, metaKey: false, shiftKey: false, altKey: false, ...modifiers } });
  });
}

/** The props of the first part of the window that has a prop named `prop` (memoised parts are not found by type). */
function propsOf(renderer: ReactTestRenderer.ReactTestRenderer, prop: string) {
  const [found] = renderer.root.findAll((node) => Object.prototype.hasOwnProperty.call(node.props, prop));
  if (found === undefined) {
    throw new Error(`nothing in the window has a ${prop} prop`);
  }
  return found.props;
}

/** The top bar's props. */
function topBar(renderer: ReactTestRenderer.ReactTestRenderer) {
  return propsOf(renderer, 'onShowShortcuts');
}

describe('App', () => {
  it('opens a file Finder hands over in a tab named after it, titled with its name', async () => {
    // Act
    const renderer = await openWindow();

    // Assert
    expect(propsOf(renderer, 'activeTabId').tabs).toEqual([expect.objectContaining({ fileName: 'nightwish.gp5', isEdited: false })]);
    expect(nativeCalls.get('GPFiles.setDocumentTitle')?.at(-1)).toEqual(['nightwish.gp5']);
    expect(topBar(renderer).lcd?.bar).toBeDefined();
  });

  it('edits the shown tab from the keyboard and undoes it with ⌘Z', async () => {
    // Arrange
    const renderer = await openWindow();

    // Act
    await press(renderer, '7');
    const edited = { canUndo: topBar(renderer).canUndo, title: nativeCalls.get('GPFiles.setDocumentTitle')?.at(-1) };
    await press(renderer, 'z', { metaKey: true });

    // Assert
    expect(edited).toEqual({ canUndo: true, title: ['nightwish.gp5 — Edited'] });
    expect(topBar(renderer).canUndo).toBe(false);
    expect(nativeCalls.get('GPFiles.setDocumentTitle')?.at(-1)).toEqual(['nightwish.gp5']);
  });

  it('plays with Space and stops with Esc', async () => {
    // Arrange
    const renderer = await openWindow();

    // Act
    await press(renderer, ' ');
    const isPlaying = topBar(renderer).isPlaying;
    await press(renderer, 'Escape');

    // Assert
    expect(isPlaying).toBe(true);
    expect(topBar(renderer).isPlaying).toBe(false);
  });
});
