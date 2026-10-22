import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { TopBar, type TopBarProps } from '../src/components/TopBar';
import { INITIAL_PANELS } from '../src/state/panels';
import { PALETTE } from '../test-support/score-helpers';

function render(overrides: Partial<TopBarProps> = {}) {
  const props: TopBarProps = {
    palette: PALETTE,
    hasDocument: true,
    canUndo: false,
    canRedo: false,
    isPlaying: false,
    isEdited: false,
    isLooping: false,
    zoom: 1,
    speedLabel: '100%',
    panels: INITIAL_PANELS,
    onTogglePanel: jest.fn(),
    onOpenMenu: jest.fn(),
    onToggleLoop: jest.fn(),
    onCommand: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TopBar {...props} />);
  });
  const button = (tooltip: string) => {
    const found = renderer.root.findAllByType(ChromeButton).find((candidate) => candidate.props.tooltip.startsWith(tooltip));
    if (found === undefined) {
      throw new Error(`no button "${tooltip}"`);
    }
    return found;
  };
  const press = (tooltip: string, pageX = 0) => ReactTestRenderer.act(() => button(tooltip).props.onPress({ nativeEvent: { pageX } }));
  return { props, button, press };
}

describe('TopBar files', () => {
  it('disables Save and Export until a document is open', () => {
    const bar = render({ hasDocument: false });
    expect(bar.button('Save as Guitar Pro 5').props.isEnabled).toBe(false);
    expect(bar.button('Export a PDF').props.isEnabled).toBe(false);
    expect(bar.button('Open a Guitar Pro file').props.isEnabled).not.toBe(false);
  });

  it('sends the file commands', () => {
    // Arrange
    const bar = render();

    // Act
    bar.press('Open a Guitar Pro file');
    bar.press('Export a PDF');
    bar.press('Import a PDF');

    // Assert
    expect((bar.props.onCommand as jest.Mock).mock.calls).toEqual([[{ type: 'openFile' }], [{ type: 'exportPdf' }], [{ type: 'importPdf' }]]);
  });

  it('opens the New menu under the pointer', () => {
    const bar = render();
    bar.press('New sheet', 42);
    expect(bar.props.onOpenMenu).toHaveBeenCalledWith('new', 42);
  });
});

describe('TopBar transport', () => {
  it('plays, and jumps to the first, previous, next and last bar', () => {
    // Arrange
    const bar = render();

    // Act
    bar.press('Play from the cursor');
    bar.press('First bar');
    bar.press('Previous bar');
    bar.press('Next bar');
    bar.press('Last bar');

    // Assert
    expect((bar.props.onCommand as jest.Mock).mock.calls.map(([command]) => command)).toEqual([
      { type: 'togglePlayback' },
      { type: 'goToBar', jump: 'first' },
      { type: 'goToBar', jump: 'previous' },
      { type: 'goToBar', jump: 'next' },
      { type: 'goToBar', jump: 'last' },
    ]);
  });

  it('shows Stop while playing and marks the loop and a playback speed other than 100%', () => {
    const bar = render({ isPlaying: true, isLooping: true, speedLabel: '80%' });
    expect(bar.button('Stop').props.isActive).toBe(true);
    expect(bar.button('Loop the bars').props.isActive).toBe(true);
    expect(bar.button('Playback speed').props.label).toBe('♩ 80% ▾');
    expect(bar.button('Playback speed').props.isActive).toBe(true);
  });

  it('toggles the loop and opens the speed and zoom menus', () => {
    // Arrange
    const bar = render();

    // Act
    bar.press('Loop the bars');
    bar.press('Playback speed', 700);
    bar.press('Zoom', 300);

    // Assert
    expect(bar.props.onToggleLoop).toHaveBeenCalledTimes(1);
    expect((bar.props.onOpenMenu as jest.Mock).mock.calls).toEqual([['speed', 700], ['zoom', 300]]);
  });
});

describe('TopBar panels and history', () => {
  it('toggles the palette, tracks, inspector and fretboard panels', () => {
    // Arrange
    const bar = render();

    // Act
    bar.press('Show or hide the edition palette');
    bar.press('Show or hide the tracks');
    bar.press('Show or hide the Song / Track inspector');
    bar.press('Show or hide the fretboard');

    // Assert
    expect((bar.props.onTogglePanel as jest.Mock).mock.calls).toEqual([['palette'], ['tracks'], ['inspector'], ['neck']]);
  });

  it('enables undo and redo only when there is something to undo or redo', () => {
    const bar = render({ canUndo: true });
    expect(bar.button('Undo').props.isEnabled).toBe(true);
    expect(bar.button('Redo').props.isEnabled).toBe(false);
    bar.press('Undo');
    expect(bar.props.onCommand).toHaveBeenCalledWith({ type: 'undo' });
  });
});
