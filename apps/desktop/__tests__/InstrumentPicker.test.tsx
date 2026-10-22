import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { BarButton } from '../src/components/BarButton';
import { InstrumentPicker, PickerRow } from '../src/components/InstrumentPicker';
import { PALETTE } from '../test-support/score-helpers';

function render(program: number) {
  const onSetProgram = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <InstrumentPicker trackName="Lead" program={program} palette={PALETTE} onSetProgram={onSetProgram} onClose={onClose} />,
    );
  });
  const rows = (pane: 'family' | 'instrument') => renderer.root.findAllByType(PickerRow).filter((row) => row.props.pane === pane);
  const labels = (pane: 'family' | 'instrument') => rows(pane).map((row) => row.props.label as string);
  const selected = (pane: 'family' | 'instrument') => rows(pane).filter((row) => row.props.isSelected === true).map((row) => row.props.label as string);
  const press = (pane: 'family' | 'instrument', label: string) => {
    const row = rows(pane).find((candidate) => candidate.props.label === label);
    if (row === undefined) {
      throw new Error(`no ${pane} row "${label}"`);
    }
    ReactTestRenderer.act(() => row.props.onPress());
  };
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { renderer, rows, labels, selected, press, texts, onSetProgram, onClose };
}

describe('InstrumentPicker', () => {
  it('shows the two steps apart: the 16 families on the left, the chosen family’s 8 instruments on the right', () => {
    // Act: program 30 is Distortion Electric Guitar, in the Guitar family
    const picker = render(30);

    // Assert
    expect(picker.labels('family')).toHaveLength(16);
    expect(picker.labels('instrument')).toHaveLength(8);
    expect(picker.texts()).toEqual(expect.arrayContaining(['1  Family', '2  Instrument']));
    expect(picker.selected('family')).toEqual(['Guitar']);
    expect(picker.selected('instrument')).toEqual(['Distortion Electric Guitar']);
    expect(picker.texts()).toContain('Now: Distortion Electric Guitar');
  });

  it('browsing a family changes only the right pane; picking there plays the instrument', () => {
    // Arrange
    const picker = render(30);

    // Act
    picker.press('family', 'Brass');

    // Assert: browsing alone changes nothing yet
    expect(picker.onSetProgram).not.toHaveBeenCalled();
    expect(picker.labels('instrument')).toContain('Trumpet');
    expect(picker.selected('instrument')).toEqual([]);
    picker.press('instrument', 'Trumpet');
    expect(picker.onSetProgram).toHaveBeenCalledWith(56);
  });

  it('closes with Done or by clicking outside the panel', () => {
    const picker = render(0);
    const done = picker.renderer.root.findAllByType(BarButton).find((button) => button.props.label === 'Done');
    ReactTestRenderer.act(() => done?.props.onPress());
    const backdrop = picker.renderer.root.findByProps({ testID: 'instrument-picker-backdrop' });
    ReactTestRenderer.act(() => backdrop.props.onPress());
    expect(picker.onClose).toHaveBeenCalledTimes(2);
  });
});
