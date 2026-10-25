// First: the native modules every src/native wrapper keeps when it loads.
import { answerNativeCalls, nativeCallCount, nativeCalls } from '../test-support/native-fakes';
import { createElement } from 'react';
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
/** Renders of the window's memoised parts (their props changed), by name. */
const mockRenders = new Map<string, number>();

/** The component, counting each time its props change (it renders when they do, as the real one does). */
function mockCounted<Props extends object>(name: string, component: (props: Props) => unknown) {
  const { memo } = jest.requireActual<typeof import('react')>('react');
  return memo((props: Props) => {
    mockRenders.set(name, (mockRenders.get(name) ?? 0) + 1);
    return createElement(component as never, props);
  });
}

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
jest.mock('../src/components/inspector/Inspector', () => {
  const actual = jest.requireActual('../src/components/inspector/Inspector');
  return { ...actual, Inspector: mockCounted('Inspector', actual.Inspector) };
});
jest.mock('../src/components/palette/EditionPalette', () => {
  const actual = jest.requireActual('../src/components/palette/EditionPalette');
  return { ...actual, EditionPalette: mockCounted('EditionPalette', actual.EditionPalette) };
});
jest.mock('../src/components/TracksPanel', () => {
  const actual = jest.requireActual('../src/components/TracksPanel');
  return { ...actual, TracksPanel: mockCounted('TracksPanel', actual.TracksPanel) };
});
jest.mock('../src/components/TabStrip', () => {
  const actual = jest.requireActual('../src/components/TabStrip');
  return { ...actual, TabStrip: mockCounted('TabStrip', actual.TabStrip) };
});

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
  mockRenders.clear();
  mockPlayer.seconds = 0;
});

/** The windows a test opened: unmounted after it, so their native listeners do not answer the next test's events. */
const mockOpenWindows: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    mockOpenWindows.splice(0).forEach((renderer) => renderer.unmount());
  });
  jest.useRealTimers();
});

/** The window with nightwish.gp5 opened from Finder and laid out at 1280 × 800, the cursor on its first beat. */
async function openWindow(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  mockOpenWindows.push(renderer);
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

describe('App: Edit ▸ Cut / Copy / Paste of the menu bar', () => {
  it('copies the cursor\'s beat, and nothing while a panel is over the score', async () => {
    // Arrange
    await openWindow();
    const copy = async () =>
      ReactTestRenderer.act(async () => {
        DeviceEventEmitter.emit('clipboardCommandRequested', { command: 'copy' });
      });

    // Act
    await copy();
    const copiedWithoutPanel = nativeCallCount('GPClipboard.writeBeats');
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('commandPaletteRequested', { mode: 'commands' });
    });
    await copy();

    // Assert
    expect(copiedWithoutPanel).toBe(1);
    expect(nativeCallCount('GPClipboard.writeBeats')).toBe(1);
  });
});

describe('App: the command palette', () => {
  it('lists the commands matching what is typed', async () => {
    // Arrange
    const renderer = await openWindow();
    await ReactTestRenderer.act(async () => {
      DeviceEventEmitter.emit('commandPaletteRequested', { mode: 'commands' });
    });
    const field = () => renderer.root.findByProps({ testID: 'command-palette-field' });
    const firstRow = () => renderer.root.findAll((node) => typeof node.props.testID === 'string' && /^command-(?!palette)/.test(node.props.testID))[0]?.props.testID;

    // Act
    const before = firstRow();
    await ReactTestRenderer.act(async () => field().props.onChangeText('tun'));

    // Assert
    expect(before).not.toBe('command-tools.tuner');
    expect(field().props.value).toBe('tun');
    expect(firstRow()).toBe('command-tools.tuner');
  });
});

describe('App: what an action re-renders', () => {
  it('leaves the inspector, the edition palette, the tab strip and the native listeners alone while the playing beat moves', async () => {
    // Arrange
    const renderer = await openWindow();
    await press(renderer, ' ');
    mockRenders.clear();
    nativeCalls.clear();

    // Act: ten beats of playback
    for (let tick = 1; tick <= 10; tick += 1) {
      mockPlayer.seconds = tick * 0.25;
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(40);
      });
    }

    // Assert
    expect(topBar(renderer).beat).toBeDefined();
    const renders = { inspector: mockRenders.get('Inspector') ?? 0, palette: mockRenders.get('EditionPalette') ?? 0, tabStrip: mockRenders.get('TabStrip') ?? 0 };
    expect(renders).toEqual({ inspector: 0, palette: 0, tabStrip: 0 });
    expect(nativeCallCount('GPFiles.addListener')).toBe(0);
  });

  it('leaves the tracks panel, the tab strip and the native listeners alone when the cursor moves between strings', async () => {
    // Arrange
    const renderer = await openWindow();
    mockRenders.clear();
    nativeCalls.clear();

    // Act
    await press(renderer, 'ArrowDown');
    await press(renderer, 'ArrowDown');
    await press(renderer, 'ArrowUp');

    // Assert
    expect({ tracksPanel: mockRenders.get('TracksPanel') ?? 0, tabStrip: mockRenders.get('TabStrip') ?? 0 }).toEqual({ tracksPanel: 0, tabStrip: 0 });
    expect(nativeCallCount('GPFiles.addListener')).toBe(0);
  });
});
