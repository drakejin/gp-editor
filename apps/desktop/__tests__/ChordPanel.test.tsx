import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Chord, Song, StringAddress } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { ChordGrid, ChordThumb } from '../src/components/chords/ChordDiagramView';
import { ChordPanel } from '../src/components/chords/ChordPanel';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const A_MINOR: Chord = { name: 'Am', firstFret: 1, frets: [0, 1, 2, 2, 0, -1] };
/** Bar 1: beat 1 plays two notes; beat 2 is a rest with an Am chord. */
const SONG: Song = makeSong([[beat(960, [note(2, 1), note(5, 3)]), { ...beat(1920, []), chord: A_MINOR }]]);
const ON_NOTES: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };
const ON_CHORD: StringAddress = { ...ON_NOTES, beatIndex: 1 };

function render(cursor: StringAddress = ON_NOTES) {
  const onApply = jest.fn();
  const onRemove = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<ChordPanel palette={PALETTE} song={SONG} cursor={cursor} onApply={onApply} onRemove={onRemove} onClose={onClose} />);
  });
  const button = (testID: string) => renderer.root.findAllByType(ChromeButton).find((candidate) => candidate.props.testID === testID);
  const press = (testID: string) => ReactTestRenderer.act(() => button(testID)?.props.onPress());
  const field = (testID: string) => renderer.root.findAllByType(TextInput).find((input) => input.props.testID === testID);
  const type = (testID: string, text: string) => ReactTestRenderer.act(() => field(testID)?.props.onChangeText(text));
  const toggle = (string: number, fret: number | 'open') => ReactTestRenderer.act(() => renderer.root.findByType(ChordGrid).props.onToggle(string, fret));
  const thumbs = () => renderer.root.findAllByType(ChordThumb);
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { renderer, onApply, onRemove, onClose, button, press, field, type, toggle, thumbs, texts };
}

describe('ChordPanel editor', () => {
  it('starts from the beat’s notes, names the grid as fingers are set, and applies it', () => {
    // Arrange
    const panel = render();

    // Act
    panel.toggle(4, 2);
    panel.toggle(1, 'open');
    panel.toggle(3, 'open');
    panel.press('chord-apply');

    // Assert
    expect(panel.field('chord-name')?.props.value).toBe('C');
    expect(panel.onApply).toHaveBeenCalledWith({ name: 'C', firstFret: 1, frets: [0, 1, 0, 2, 3, -1] }, false);
  });

  it('opens on the beat’s chord, writes the notes into a rest by default, and removes the chord', () => {
    // Arrange
    const panel = render(ON_CHORD);

    // Act
    panel.press('chord-apply');
    panel.press('chord-with-notes');
    panel.press('chord-apply');
    panel.press('chord-remove');

    // Assert
    expect(panel.field('chord-name')?.props.value).toBe('Am');
    expect(panel.onApply.mock.calls).toEqual([
      [A_MINOR, true],
      [A_MINOR, false],
    ]);
    expect(panel.onRemove).toHaveBeenCalledTimes(1);
    expect(panel.button('chord-use-notes')?.props.isEnabled).toBe(false);
  });

  it('keeps a typed name, and cannot apply an empty grid without a name', () => {
    // Arrange
    const panel = render(ON_CHORD);

    // Act
    panel.type('chord-name', 'Am (intro)');
    panel.toggle(6, 'open');
    const named = panel.field('chord-name')?.props.value;
    ReactTestRenderer.act(() => panel.renderer.root.findAllByType(ChromeButton).find((b) => b.props.label === 'Clear')?.props.onPress());
    panel.type('chord-name', '');

    // Assert
    expect(named).toBe('Am (intro)');
    expect(panel.button('chord-apply')?.props.isEnabled).toBe(false);
  });

  it('closes from Done and from a click outside', () => {
    const panel = render();
    ReactTestRenderer.act(() => panel.renderer.root.findAllByType(ChromeButton).find((b) => b.props.label === 'Done')?.props.onPress());
    ReactTestRenderer.act(() => panel.renderer.root.findAll((node) => node.props.testID === 'chord-panel-backdrop')[0]?.props.onPress());
    expect(panel.onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ChordPanel library', () => {
  it('finds the voicings of a chord by name and loads one into the grid', () => {
    // Arrange
    const panel = render();

    // Act
    panel.type('chord-search', 'C/G');
    const found = panel.thumbs().length;
    ReactTestRenderer.act(() => panel.thumbs()[0]?.props.onPress());

    // Assert
    expect(found).toBeGreaterThan(5);
    expect(panel.field('chord-name')?.props.value).toBe('C/G');
    expect(panel.renderer.root.findByType(ChordGrid).props.draft.frets[5]).toBe(3);
  });

  it('says when the text is not a chord name', () => {
    const panel = render();
    panel.type('chord-search', 'Hm');
    expect(panel.texts()).toContain('“Hm” is not a chord name.');
    expect(panel.thumbs()).toHaveLength(0);
  });

  it('lists every name the grid’s frets can have, and names the chord with one', () => {
    // Arrange
    const panel = render(ON_CHORD);
    panel.press('chord-library-position');

    // Act
    const names = panel.renderer.root.findAllByType(ChromeButton).filter((b) => String(b.props.testID).startsWith('chord-name-'));
    ReactTestRenderer.act(() => names.find((b) => String(b.props.label).startsWith('C6/A'))?.props.onPress());

    // Assert
    expect(names[0]?.props.label).toBe('Am  100%');
    expect(panel.field('chord-name')?.props.value).toBe('C6/A');
  });

  it('lists the chords the track already uses', () => {
    const panel = render();
    panel.press('chord-library-song');
    expect(panel.thumbs().map((thumb) => thumb.props.chord)).toEqual([A_MINOR]);
  });
});
