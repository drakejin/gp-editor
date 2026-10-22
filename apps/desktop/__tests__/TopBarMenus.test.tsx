import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeMenu, MenuButton, MenuItem } from '../src/components/chrome/ChromeMenu';
import { NewMenu, SpeedMenu, type SpeedMenuProps, ZoomMenu } from '../src/components/TopBarMenus';
import { INITIAL_PRACTICE } from '../src/state/practice';
import { PALETTE } from '../test-support/score-helpers';

function renderSpeed(overrides: Partial<SpeedMenuProps> = {}) {
  const props: SpeedMenuProps = {
    palette: PALETTE,
    practice: INITIAL_PRACTICE,
    writtenTempo: 130,
    measureCount: 8,
    cursorMeasureIndex: 2,
    onChangePractice: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SpeedMenu {...props} />);
  });
  const items = () => renderer.root.findAllByType(MenuItem);
  const item = (label: string) => items().find((candidate) => candidate.props.label === label);
  const pressItem = (label: string) => ReactTestRenderer.act(() => item(label)?.props.onPress());
  const pressButton = (tooltip: string) =>
    ReactTestRenderer.act(() => renderer.root.findAllByType(MenuButton).find((button) => button.props.tooltip === tooltip)?.props.onPress());
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { props, items, item, pressItem, pressButton, texts };
}

describe('SpeedMenu', () => {
  it('lists Guitar Pro’s percentages, then tempos with the written one marked, and checks the current speed', () => {
    const menu = renderSpeed();
    expect(menu.items().map((item) => item.props.label)).toEqual([
      '25%', '50%', '60%', '70%', '80%', '90%', '100%', '60 BPM', '90 BPM', '120 BPM', '130 BPM (written tempo)', '150 BPM',
    ]);
    expect(menu.item('100%')?.props.isChecked).toBe(true);
  });

  it('sets a percentage or a tempo and closes', () => {
    // Arrange
    const menu = renderSpeed();

    // Act
    menu.pressItem('80%');
    menu.pressItem('90 BPM');

    // Assert
    expect((menu.props.onChangePractice as jest.Mock).mock.calls).toEqual([
      [{ type: 'setTempoScale', scale: 0.8, writtenTempo: 130 }],
      [{ type: 'setTempo', tempo: 90, writtenTempo: 130 }],
    ]);
    expect(menu.props.onClose).toHaveBeenCalledTimes(2);
  });

  it('steps a custom tempo and the loop bars without closing', () => {
    // Arrange
    const menu = renderSpeed();

    // Act
    menu.pressButton('Playback tempo: less');
    menu.pressButton('Last bar of the loop: more');
    menu.pressButton('Start the loop at the cursor’s bar');

    // Assert
    expect((menu.props.onChangePractice as jest.Mock).mock.calls).toEqual([
      [{ type: 'shiftTempo', delta: -5, writtenTempo: 130 }],
      [{ type: 'setLoopTo', measureIndex: 3, measureCount: 8, cursorMeasureIndex: 2 }],
      [{ type: 'setLoopFrom', measureIndex: 2, measureCount: 8, cursorMeasureIndex: 2 }],
    ]);
    expect(menu.props.onClose).not.toHaveBeenCalled();
  });

  it('shows the loop bars 1-based and the speed trainer', () => {
    // Arrange
    const practice = { ...INITIAL_PRACTICE, isLooping: true, loop: { fromMeasureIndex: 1, toMeasureIndex: 4 }, trainerStep: 5 };

    // Act
    const menu = renderSpeed({ practice });
    menu.pressButton('BPM added each pass of the loop: more');

    // Assert
    expect(menu.texts()).toEqual(expect.arrayContaining(['2', '5', '+5 BPM']));
    expect(menu.props.onChangePractice).toHaveBeenCalledWith({ type: 'shiftTrainerStep', delta: 1 });
  });
});

describe('ZoomMenu and NewMenu', () => {
  it('zooms to a level and closes', () => {
    // Arrange
    const onZoom = jest.fn();
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ZoomMenu palette={PALETTE} zoom={1} onZoom={onZoom} onClose={onClose} />);
    });

    // Act
    ReactTestRenderer.act(() => renderer.root.findAllByType(MenuItem).find((item) => item.props.label === '150%')?.props.onPress());

    // Assert
    expect(renderer.root.findAllByType(MenuItem).find((item) => item.props.label === '100%')?.props.isChecked).toBe(true);
    expect(onZoom).toHaveBeenCalledWith(1.5);
    expect(onClose).toHaveBeenCalled();
  });

  it('creates a sheet in the chosen view', () => {
    const onCreate = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<NewMenu palette={PALETTE} onCreate={onCreate} onClose={() => undefined} />);
    });
    expect(renderer.root.findAllByType(MenuItem).map((item) => item.props.label)).toEqual(['New Score + Tab', 'New Score', 'New Tab']);
    ReactTestRenderer.act(() => renderer.root.findAllByType(MenuItem)[2]?.props.onPress());
    expect(onCreate).toHaveBeenCalledWith('tab');
  });

  it('closes a menu on a click outside it', () => {
    const onClose = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ChromeMenu palette={PALETTE} x={100} top={46} windowWidth={1200} onClose={onClose}>
          <Text>menu</Text>
        </ChromeMenu>,
      );
    });
    ReactTestRenderer.act(() => renderer.root.findByProps({ testID: 'chrome-menu-backdrop' }).props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
