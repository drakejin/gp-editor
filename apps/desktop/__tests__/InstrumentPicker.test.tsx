import ReactTestRenderer from 'react-test-renderer';
import { BarButton } from '../src/components/BarButton';
import { InstrumentPicker } from '../src/components/InstrumentPicker';
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
  const buttons = () => renderer.root.findAllByType(BarButton);
  const press = (label: string) => {
    const button = buttons().find((candidate) => candidate.props.label === label);
    if (button === undefined) {
      throw new Error(`no button "${label}"`);
    }
    ReactTestRenderer.act(() => button.props.onPress());
  };
  return { buttons, press, onSetProgram, onClose };
}

describe('InstrumentPicker', () => {
  it('opens on the family of the current program, with that program marked', () => {
    // Arrange + Act: program 30 is Distortion Electric Guitar, in the Guitar family
    const picker = render(30);

    // Assert
    const active = picker.buttons().filter((button) => button.props.isActive === true).map((button) => button.props.label);
    expect(active).toEqual(['Guitar', 'Distortion Electric Guitar']);
    expect(picker.buttons().map((button) => button.props.label)).toContain('Nylon String Acoustic Guitar');
  });

  it('shows another family’s eight sounds and plays the one clicked', () => {
    const picker = render(30);
    picker.press('Brass');
    picker.press('Trumpet');
    expect(picker.onSetProgram).toHaveBeenCalledWith(56);
    expect(picker.buttons().map((button) => button.props.label)).not.toContain('Distortion Electric Guitar');
  });

  it('closes with Done', () => {
    const picker = render(0);
    picker.press('Done');
    expect(picker.onClose).toHaveBeenCalled();
  });
});
