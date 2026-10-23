import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { MidiInputSection } from '../src/components/inspector/MidiInputSection';
import type { MidiInput } from '../src/hooks/use-midi-input';
import { DEFAULT_MIDI_INPUT } from '../src/lib/midi-input';
import { PALETTE } from '../test-support/score-helpers';

const KEYBOARD = { id: 11, name: 'Keystation 49' };

function render(overrides: Partial<MidiInput> = {}) {
  const midiInput: MidiInput = { settings: { ...DEFAULT_MIDI_INPUT, isEnabled: true }, sources: [KEYBOARD], listening: 1, changeSettings: jest.fn(), ...overrides };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<MidiInputSection palette={PALETTE} midiInput={midiInput} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((candidate) => candidate.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { midiInput, button, press, texts };
}

describe('MidiInputSection', () => {
  it('shows MIDI input on, every source chosen, and what it listens to', () => {
    const section = render();
    expect(section.button('Stop entering notes from MIDI')?.props.label).toBe('● On');
    expect(section.button('Listen to every MIDI source')?.props.isActive).toBe(true);
    expect(section.button('Listen to Keystation 49 only')?.props.isActive).toBe(false);
    expect(section.texts()).toContain('Listening to 1 source.');
  });

  it('switches input off, picks a source, MIDI guitar mode and velocity', () => {
    // Arrange
    const section = render();

    // Act
    section.press('Stop entering notes from MIDI');
    section.press('Listen to Keystation 49 only');
    section.press('Channel 1 is string 1, channel 2 string 2 … as a MIDI guitar sends them');
    section.press('Notes get the velocity they were played with');

    // Assert
    expect((section.midiInput.changeSettings as jest.Mock).mock.calls).toEqual([[{ isEnabled: false }], [{ sourceId: 11 }], [{ isGuitarMode: true }], [{ usesVelocity: true }]]);
  });

  it('says when it is off, when no source is there, when the chosen one is gone, and what went wrong', () => {
    expect(render({ settings: DEFAULT_MIDI_INPUT }).texts()).toContain('Off.');
    expect(render({ sources: [], listening: 0 }).texts()).toContain('No MIDI source found: connect a keyboard or MIDI guitar.');
    expect(render({ settings: { ...DEFAULT_MIDI_INPUT, isEnabled: true, sourceId: 99 }, listening: 0 }).texts()).toContain('The chosen source is not connected.');
    expect(render({ error: 'MIDI is not available on this Mac.' }).texts()).toContain('MIDI is not available on this Mac.');
  });
});
