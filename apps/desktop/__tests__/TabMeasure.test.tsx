import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { QUARTER } from '@gp-editor/core';
import { TabMeasure } from '../src/components/TabMeasure';
import { layoutMeasure } from '../src/lib/layout';
import { beat, header, makeSong, note } from '../test-support/songs';

const PALETTE = {
  background: '#000', sidebar: '#111', paper: '#fff', text: '#222', muted: '#333', line: '#444',
  accent: '#f00', accentText: '#fff', selection: '#ff0', danger: '#f00', border: '#555',
};

function render(selectionNote?: number) {
  const song = makeSong(
    [[beat(960, [note(1, 3), note(6, 0, { deadNote: true })]), beat(1920, [], { ...QUARTER, value: 8 })]],
    [header(1, { repeatOpen: true, repeatClose: 2, marker: { title: 'Intro', color: { r: 1, g: 2, b: 3 } } })],
  );
  const track = song.tracks[0]!;
  const onSelectNote = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <TabMeasure
        track={track}
        trackIndex={0}
        header={song.measureHeaders[0]!}
        layout={layoutMeasure(song, 0, 0)}
        selection={selectionNote === undefined ? undefined : { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, noteIndex: selectionNote }}
        palette={PALETTE}
        onSelectNote={onSelectNote}
      />,
    );
  });
  const texts = renderer.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
  return { renderer, texts, onSelectNote };
}

describe('TabMeasure', () => {
  it('renders frets, measure number, marker, tempo, time signature and repeat count', () => {
    const { texts } = render();
    expect(texts).toEqual(expect.arrayContaining(['1', 'Intro', '♩ = 120', '4', '3', 'x', 'x2']));
  });

  it('reports the clicked note address', () => {
    const { renderer, onSelectNote } = render();
    const fret = renderer.root.findAll((node) => typeof node.props.onPress === 'function')[1]!;
    ReactTestRenderer.act(() => fret.props.onPress());
    expect(onSelectNote).toHaveBeenCalledWith({ trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, noteIndex: 1 });
  });

  it('highlights the selected note', () => {
    const { renderer } = render(0);
    const pressables = renderer.root.findAll((node) => typeof node.props.onPress === 'function' && node.props.style !== undefined);
    const styles = pressables.map((node) => JSON.stringify(node.props.style));
    expect(styles.some((style) => style.includes(PALETTE.selection))).toBe(true);
  });
});
