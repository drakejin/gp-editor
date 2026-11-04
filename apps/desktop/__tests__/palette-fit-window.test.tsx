// First: the native modules every src/native wrapper keeps when it loads.
import { answerNativeCalls } from '../test-support/native-fakes';
import type { ElementType } from 'react';
import { DeviceEventEmitter, StyleSheet, View } from 'react-native';
import ReactTestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import App from '../src/App';
import { AnnotationPanel } from '../src/components/annotations/AnnotationPanel';
import { ExportPanel } from '../src/components/ExportPanel';
import { HintBar } from '../src/components/HintBar';
import { ImportBanner } from '../src/components/ImportBanner';
import { ImportPanel } from '../src/components/ImportPanel';
import { StartScreen } from '../src/components/window/StartScreen';
import { DesignModeBar } from '../src/components/stylesheet/DesignModeBar';
import { ErrorBanner } from '../src/components/WindowOverlays';
import { bytesToBase64 } from '../src/lib/base64';
import { HANDLED_KEYS } from '../src/lib/key-commands';
import { TAB } from '../src/lib/layout';
import { DRAG_DEAD_ZONE, MIN_PITCH_DRAG_STEP, PITCH_DRAG_STEP } from '../src/lib/pitch-drag';
import { placeRow } from '../src/score/row';
import { readFixture } from '../test-support/fixtures';
import { placementOf } from '../test-support/palette-fit';

// The user's rule — every tool of the edition palette shows without scrolling at the default window — holds only if
// nothing but the top bar and the tab strip takes height from the palette (palette-fit.test.ts lays the groups out under
// them). In 0.21's QA a hint ("Transposed 68 notes …", 26 points) pushed the palette down and ONLINE TOOLS below the
// window: the hint, the panels and the banners under the tab strip must sit beside the palette, not above it.

const FILE_PATH = '/songs/nightwish.gp5';
const MISSING_PATH = '/songs/missing.gp5';

jest.mock('../src/native/specs/GPScoreCanvasNativeComponent', () => 'GPScoreCanvas');
jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));

/** Whether the native side has an Anthropic key (File ▸ Import PDF… opens the import settings without one). */
const mockKey = { isSet: true };

beforeAll(() =>
  answerNativeCalls((moduleName, method, args) => {
    if (moduleName === 'GPFiles' && method === 'readFile') {
      return args[0] === MISSING_PATH
        ? Promise.reject(new Error('No such file')) // i18n-exempt: a native error in a test
        : Promise.resolve({ name: 'nightwish.gp5', path: FILE_PATH, base64: bytesToBase64(readFixture('guitarpro5', 'nightwish.gp5')) });
    }
    if (moduleName === 'GPAnthropic' && method === 'hasApiKey') {
      return Promise.resolve(mockKey.isSet);
    }
    // i18n-exempt: a native error in a test
    return moduleName === 'GPProjects' && method === 'choosePdf' ? Promise.reject(new Error('The PDF could not be read')) : undefined;
  }),
);

beforeEach(() => {
  jest.useFakeTimers();
  mockKey.isSet = true;
});

const openWindows: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    openWindows.splice(0).forEach((renderer) => renderer.unmount());
  });
  jest.useRealTimers();
});

async function emit(event: string, body?: object): Promise<void> {
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit(event, body);
  });
}

/** The window laid out at 1280 × 800; with nightwish.gp5 opened from Finder, the cursor on its first beat (string 1, empty). */
async function openWindow(isFileOpened = true): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  openWindows.push(renderer);
  if (isFileOpened) {
    await emit('fileOpened', { path: FILE_PATH });
  }
  await ReactTestRenderer.act(async () => {
    for (const node of renderer.root.findAll((candidate) => typeof candidate.props.onLayout === 'function')) {
      node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 1280, height: 800 } } });
    }
  });
  return renderer;
}

async function press(renderer: ReactTestRenderer.ReactTestRenderer, key: string): Promise<void> {
  const root = renderer.root.find((node) => node.props.keyDownEvents === HANDLED_KEYS);
  await ReactTestRenderer.act(async () => {
    root.props.onKeyDown({ nativeEvent: { key, metaKey: false, shiftKey: false, altKey: false } });
  });
}

/** The edition palette (memoised: found by a prop only it has). */
function paletteOf(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestInstance {
  return partWith(renderer, 'isExpressionTextOpen');
}

function shown(renderer: ReactTestRenderer.ReactTestRenderer, type: ElementType): ReactTestInstance {
  return renderer.root.findByType(type);
}

/** The first part of the window with a prop named `prop` (memoised parts are not found by type). */
function partWith(renderer: ReactTestRenderer.ReactTestRenderer, prop: string): ReactTestInstance {
  return renderer.root.find((node) => Object.prototype.hasOwnProperty.call(node.props, prop));
}

interface Band {
  readonly name: string;
  readonly type: ElementType;
  readonly show: (renderer: ReactTestRenderer.ReactTestRenderer) => Promise<void>;
}

const BANDS: readonly Band[] = [
  // B on a string without a note: the hint strip says why nothing happened.
  { name: 'the hint', type: HintBar, show: (renderer) => press(renderer, 'b') },
  { name: 'Design Mode’s strip (the palette’s ↔)', type: DesignModeBar, show: () => emit('layoutCommandRequested', { command: 'designMode' }) },
  { name: 'the annotation panel (the palette’s ✎, J)', type: AnnotationPanel, show: (renderer) => press(renderer, 'j') },
  { name: 'the PDF export’s panel', type: ExportPanel, show: () => emit('exportRequested') },
  { name: 'the PDF import’s banner', type: ImportBanner, show: () => emit('importPdfRequested') },
  { name: 'an error', type: ErrorBanner, show: () => emit('fileOpened', { path: MISSING_PATH }) },
];

describe('the window around the edition palette', () => {
  it('stacks the top bar and the tab strip above the palette', async () => {
    // Act
    const renderer = await openWindow();

    // Assert
    const palette = paletteOf(renderer);
    expect(placementOf(partWith(renderer, 'onShowShortcuts'), palette)).toBe('above'); // the top bar
    expect(placementOf(partWith(renderer, 'activeTabId'), palette)).toBe('above'); // the tab strip
  });

  it.each(BANDS)('shows $name beside the palette, not above or below it', async ({ type, show }) => {
    // Arrange
    const renderer = await openWindow();

    // Act
    await show(renderer);

    // Assert
    expect(placementOf(shown(renderer, type), paletteOf(renderer))).toBe('beside');
  });

  it('shows an error across the window over the start screen when no tab is open', async () => {
    // Arrange
    const renderer = await openWindow(false);

    // Act
    await emit('fileOpened', { path: MISSING_PATH });

    // Assert
    expect(placementOf(shown(renderer, ErrorBanner), shown(renderer, StartScreen))).toBe('above');
  });

  it('keeps what a panel under the tab strip holds when the first tab opens beside the palette', async () => {
    // Arrange: no tab; File ▸ Import PDF… without a key opens the import settings, and a key is being typed
    mockKey.isSet = false;
    const renderer = await openWindow(false);
    await emit('importPdfRequested');
    const keyField = () => shown(renderer, ImportPanel).find((node) => typeof node.props.onChangeText === 'function' && typeof node.props.value === 'string');
    await ReactTestRenderer.act(async () => keyField().props.onChangeText('typed, not saved yet'));

    // Act
    await emit('fileOpened', { path: FILE_PATH });

    // Assert
    expect(placementOf(shown(renderer, ImportPanel), paletteOf(renderer))).toBe('beside');
    expect(keyField().props.value).toBe('typed, not saved yet');
  });
});

describe('a note dragged up or down in the window', () => {
  /** The first system's score row (memoised: found by its props), its Pressable, and its first note on the tab (voice 1). */
  function firstNote(renderer: ReactTestRenderer.ReactTestRenderer) {
    const row = renderer.root.find((node) => node.props.rowIndex === 0 && typeof node.props.onEndNote === 'function' && node.props.geometry !== undefined);
    const pressable = row.find((node) => typeof node.props.onPressMove === 'function');
    const { song, trackIndex, headerWidth, geometry, zoom } = row.props;
    const notes = placeRow(row.props.row, headerWidth).flatMap((bar) =>
      bar.layout.beats.flatMap((beat) => {
        const found = song.tracks[trackIndex].measures[bar.layout.measureIndex].beats[beat.beatIndex]?.voices[0]?.notes[0];
        return found === undefined ? [] : [{ note: found, x: bar.x + beat.x }];
      }),
    );
    const { note, x } = notes[0] ?? { note: undefined, x: Number.NaN };
    const y = geometry.tabTop + (note.string - 1) * TAB.stringGap;
    return { pressable, note, point: { x: x * zoom, y: y * zoom }, zoom };
  }

  it('shows the drag’s hint laid over the tab strip, not as the hint strip, and moves the note when let go', async () => {
    // Arrange
    const renderer = await openWindow();
    const { pressable, note, point, zoom } = firstNote(renderer);
    const [pageX, pageY] = [500, 400];

    // Act: down on the note, then 3 semitones up
    await ReactTestRenderer.act(async () => pressable.props.onPressIn({ nativeEvent: { locationX: point.x, locationY: point.y, pageX, pageY } }));
    const threeSemitones = DRAG_DEAD_ZONE + 3 * Math.max(PITCH_DRAG_STEP * zoom, MIN_PITCH_DRAG_STEP);
    await ReactTestRenderer.act(async () => pressable.props.onPressMove({ nativeEvent: { pageX, pageY: pageY - threeSemitones } }));
    const hints = renderer.root.findAllByType(HintBar);
    const overlay = hints[0]?.parent;
    const during = { messages: hints.map((hint) => hint.props.message), isStrip: hints.some((hint) => hint.props.onDismiss !== undefined) };
    const overlayStyle = StyleSheet.flatten(overlay?.props.style);
    // The overlay's nearest container that holds the tab strip: the strip's own, not the window's (no palette in it).
    const has = (prop: string) => (node: ReactTestInstance) => Object.prototype.hasOwnProperty.call(node.props, prop);
    let container = overlay?.parent ?? null;
    while (container !== null && container.findAll(has('activeTabId')).length === 0) {
      container = container.parent;
    }
    const isOverTabs = container !== null && container.findAll(has('isExpressionTextOpen')).length === 0;
    await ReactTestRenderer.act(async () => pressable.props.onPressOut());

    // Assert
    expect(during).toEqual({ messages: ['+3 semitones: let go to move, Esc to cancel'], isStrip: false });
    expect(overlayStyle).toMatchObject({ position: 'absolute' });
    expect(isOverTabs).toBe(true);
    expect(renderer.root.findAllByType(HintBar)).toHaveLength(0);
    const moved = firstNote(renderer).note;
    expect([moved.string, moved.fret]).toEqual([note.string, note.fret + 3]);
  });
});

describe('placementOf', () => {
  it('tells above and below in a column, beside in a row, and one part inside another', () => {
    // Arrange: a column of `top` and a row of `left` and `right`, `inner` inside `right`
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <View>
          <View testID="top" />
          <View style={{ flexDirection: 'row' }}>
            <View testID="left" />
            <View testID="right">
              <View testID="inner" />
            </View>
          </View>
        </View>,
      );
    });
    const part = (testID: string) => renderer.root.find((node) => node.props.testID === testID && typeof node.type === 'string');

    // Act / Assert
    expect(placementOf(part('top'), part('left'))).toBe('above');
    expect(placementOf(part('right'), part('top'))).toBe('below');
    expect(placementOf(part('left'), part('inner'))).toBe('beside');
    expect(placementOf(part('inner'), part('right'))).toBe('inside');
    expect(placementOf(part('right'), part('inner'))).toBe('inside');
  });
});
