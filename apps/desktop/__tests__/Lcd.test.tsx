import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Lcd, type LcdProps } from '../src/components/Lcd';
import type { LcdInfo } from '../src/lib/lcd';
import { PALETTE } from '../test-support/score-helpers';

const INFO: LcdInfo = {
  track: '1. Guitar',
  bar: '2/3',
  timeSignature: '4/4',
  clock: '00:02 / 00:06',
  tempo: '♩ = 120',
  tempoBpm: 120,
  position: 'Beat 1 · String 2 · Fret 5',
};

function render(overrides: Partial<LcdProps> = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Lcd palette={PALETTE} info={INFO} {...overrides} />);
  });
  const dots = () => renderer.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('beat-dot-') && typeof node.type === 'string');
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { renderer, dots, texts };
}

describe('Lcd visual metronome', () => {
  it('shows a dot per beat while playing, the current one lit and the first one the accent', () => {
    // Act
    const { dots } = render({ beat: { index: 1, count: 4, isCountIn: false } });

    // Assert
    expect(dots().map((dot) => dot.props.testID)).toEqual(['beat-dot-0-accent', 'beat-dot-1-lit', 'beat-dot-2', 'beat-dot-3']);
  });

  it('counts the count-in with its own label, and shows no dots when stopped', () => {
    expect(render({ beat: { index: 0, count: 3, isCountIn: true } }).texts()).toContain('Count-in');
    expect(render().dots()).toHaveLength(0);
  });

  it('shows the beat number instead of dots for long bars', () => {
    const { dots, texts } = render({ beat: { index: 9, count: 15, isCountIn: false } });
    expect(dots()).toHaveLength(0);
    expect(texts()).toContain('10/15');
  });
});

describe('Lcd tempo field', () => {
  it('types a tempo with decimals in the LCD: a click on the tempo opens the field', () => {
    // Arrange
    const onSetTempo = jest.fn();
    const { renderer } = render({ onSetTempo });
    ReactTestRenderer.act(() => renderer.root.findByProps({ testID: 'lcd-tempo' }).props.onPress());
    const field = () => renderer.root.findByType(TextInput);

    // Act
    const initial = field().props.value;
    ReactTestRenderer.act(() => field().props.onChangeText('92.5'));
    ReactTestRenderer.act(() => field().props.onSubmitEditing());

    // Assert
    expect(initial).toBe('120');
    expect(onSetTempo).toHaveBeenCalledWith(92.5);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('ignores what is not a tempo', () => {
    const onSetTempo = jest.fn();
    const { renderer } = render({ onSetTempo });
    ReactTestRenderer.act(() => renderer.root.findByProps({ testID: 'lcd-tempo' }).props.onPress());
    ReactTestRenderer.act(() => renderer.root.findByType(TextInput).props.onChangeText('fast'));
    ReactTestRenderer.act(() => renderer.root.findByType(TextInput).props.onSubmitEditing());
    expect(onSetTempo).not.toHaveBeenCalled();
  });
});

describe('Lcd track', () => {
  it('shows the track’s colour and, as Guitar Pro 8 does, its icon before its name', () => {
    // Act
    const withIcon = render({ trackColor: 'rgb(117,203,222)', trackIcon: 'bass' });
    const without = render({ trackColor: 'rgb(117,203,222)' });

    // Assert
    const icons = (lcd: ReturnType<typeof render>) => lcd.renderer.root.findAll((node) => typeof node.props.icon === 'string' && typeof node.props.size === 'number');
    expect([...new Set(icons(withIcon).map((node) => node.props.icon))]).toEqual(['bass']);
    expect(icons(without)).toEqual([]);
    expect(withIcon.texts()).toContain('1. Guitar');
  });
});
