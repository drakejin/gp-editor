import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { AddTrackPanel } from '../src/components/AddTrackPanel';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { DeleteTrackPanel } from '../src/components/DeleteTrackPanel';
import { PALETTE } from '../test-support/score-helpers';

function render() {
  const onAdd = jest.fn();
  const onCancel = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<AddTrackPanel palette={PALETTE} onAdd={onAdd} onCancel={onCancel} />);
  });
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const labels = () => buttons().map((button) => button.props.label as string);
  const button = (label: string) => {
    const found = buttons().find((candidate) => candidate.props.label === label);
    if (found === undefined) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  };
  const press = (label: string) => ReactTestRenderer.act(() => button(label).props.onPress());
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  const typeName = (name: string) => ReactTestRenderer.act(() => renderer.root.findByProps({ testID: 'add-track-name' }).props.onChangeText(name));
  return { renderer, onAdd, onCancel, labels, button, press, texts, typeName };
}

describe('AddTrackPanel', () => {
  it('offers every instrument, a 6-string guitar in standard tuning lit at first', () => {
    // Act
    const panel = render();

    // Assert
    expect(panel.labels()).toEqual(expect.arrayContaining(['Guitar', 'Bass', 'Banjo', 'Ukulele', 'Drums', 'Piano', 'Other', '6', '7', '8', 'Standard', 'Drop D']));
    expect(panel.button('Guitar').props.isActive).toBe(true);
    expect(panel.button('6').props.isActive).toBe(true);
    expect(panel.button('Steel String Acoustic Guitar').props.isActive).toBe(true);
    expect(panel.texts()).toContain('E A D G B E');
  });

  it('adds a 5-string bass in its tuning, named as typed', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Bass');
    panel.press('5');
    panel.typeName('Low end');
    panel.press('Fretless Electric Bass');
    panel.press('Add Track');

    // Assert
    expect(panel.onAdd).toHaveBeenCalledWith({ kind: 'bass', name: 'Low end', program: 35, tuning: [43, 38, 33, 28, 23], capo: 0 });
  });

  it('adds drums without strings, sound or capo choices', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Drums');

    // Assert
    expect(panel.labels()).not.toContain('Standard');
    expect(panel.labels()).not.toContain('+');
    panel.press('Add Track');
    expect(panel.onAdd).toHaveBeenCalledWith({ kind: 'drums', name: undefined });
  });

  it('browses the General MIDI families for another instrument, and sets a capo', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Other');
    panel.press('Brass');
    panel.press('Trumpet');
    panel.press('+');
    panel.press('Add Track');

    // Assert
    expect(panel.onAdd).toHaveBeenCalledWith(expect.objectContaining({ kind: 'other', program: 56, capo: 1 }));
    expect(panel.texts()).toContain('Fret 1');
  });

  it('adds nothing on Cancel or a click outside', () => {
    const panel = render();
    panel.press('Cancel');
    ReactTestRenderer.act(() => panel.renderer.root.findByProps({ testID: 'add-track-backdrop' }).props.onPress());
    expect(panel.onCancel).toHaveBeenCalledTimes(2);
    expect(panel.onAdd).not.toHaveBeenCalled();
  });
});

describe('DeleteTrackPanel', () => {
  it('asks before deleting the track, naming it, and answers Delete or Cancel', () => {
    // Arrange
    const onDelete = jest.fn();
    const onCancel = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DeleteTrackPanel palette={PALETTE} trackLabel="2. Bass" onDelete={onDelete} onCancel={onCancel} />);
    });
    const press = (label: string) => ReactTestRenderer.act(() => renderer.root.findAllByType(ChromeButton).find((button) => button.props.label === label)?.props.onPress());

    // Act
    press('Delete');
    press('Cancel');

    // Assert
    expect(renderer.root.findAllByType(Text).map((text) => text.props.children)).toContain('Delete track “2. Bass”?');
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
