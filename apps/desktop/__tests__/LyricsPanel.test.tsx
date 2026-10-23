import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { Song } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { LyricsPanel, type LyricsPanelProps } from '../src/components/lyrics/LyricsPanel';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

/** Lead and Voice, three bars of one note each; Lead sings "la la". */
function twoTracks(): Song {
  const song = makeSong([[beat(960, [note(1, 0)])], [beat(4800, [note(1, 2)])], [beat(8640, [note(1, 3)])]]);
  const track = song.tracks[0]!;
  return { ...song, tracks: [{ ...track, name: 'Lead', lyrics: { from: 1, text: 'la la' } }, { ...track, number: 2, name: 'Voice' }] };
}

function render(overrides: Partial<LyricsPanelProps> = {}) {
  const props: LyricsPanelProps = {
    palette: PALETTE,
    song: twoTracks(),
    draft: { trackIndex: 1, from: 2, text: 'Hel-lo you' },
    onChooseTrack: jest.fn(),
    onChangeFrom: jest.fn(),
    onChangeText: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<LyricsPanel {...props} />);
  });
  const button = (tooltip: string) => renderer.root.findAllByType(ChromeButton).find((found) => found.props.tooltip === tooltip);
  const press = (tooltip: string) => ReactTestRenderer.act(() => button(tooltip)?.props.onPress());
  const field = () => renderer.root.findAllByType(TextInput).find((found) => found.props.accessibilityLabel === 'Lyrics text');
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { props, button, press, field, texts };
}

describe('LyricsPanel', () => {
  it('edits the draft’s text in a multi-line field', () => {
    // Arrange
    const panel = render();

    // Act
    ReactTestRenderer.act(() => panel.field()?.props.onChangeText('Hel-lo there'));

    // Assert
    expect(panel.field()?.props.value).toBe('Hel-lo you');
    expect(panel.field()?.props.multiline).toBe(true);
    expect(panel.props.onChangeText).toHaveBeenCalledWith('Hel-lo there');
  });

  it('chooses the track, the shown one lit', () => {
    const panel = render();
    expect(panel.button('Lyrics of track 2, Voice')?.props.isActive).toBe(true);
    panel.press('Lyrics of track 1, Lead');
    expect(panel.props.onChooseTrack).toHaveBeenCalledWith(0);
  });

  it('steps the first bar within the song', () => {
    const panel = render();
    panel.press('Start a bar later');
    panel.press('Start a bar earlier');
    expect((panel.props.onChangeFrom as jest.Mock).mock.calls).toEqual([[3], [1]]);
    expect(render({ draft: { trackIndex: 0, from: 1, text: '' } }).button('Start a bar earlier')?.props.isEnabled).toBe(false);
    expect(render({ draft: { trackIndex: 0, from: 3, text: '' } }).button('Start a bar later')?.props.isEnabled).toBe(false);
  });

  it('counts syllables against notes, explains the syntax and warns about Guitar Pro 5’s one lyrics track', () => {
    const texts = render().texts();
    expect(texts).toContain('3 syllables for 2 notes from bar 2: the last 1 has no note');
    expect(texts.some((text) => text.includes('hyphen'))).toBe(true);
    expect(texts).toContain('Saved as Guitar Pro 5, the song keeps one track’s lyrics: those of “Lead”.');
  });

  it('closes', () => {
    const panel = render();
    panel.press('Close the lyrics editor');
    expect(panel.props.onClose).toHaveBeenCalledTimes(1);
  });
});
