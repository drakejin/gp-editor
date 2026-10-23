import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_MASTER, type Effect, type MasterMix, buildEffect } from '@gp-editor/core';
import { EffectChainEditor, type EffectChainEditorProps } from '../src/components/effects/EffectChainEditor';
import { MasterStripEditor } from '../src/components/effects/MasterStripEditor';
import { PALETTE } from '../test-support/score-helpers';

function render(effects: readonly Effect[], overrides: Partial<EffectChainEditorProps> = {}) {
  const onChange = jest.fn<void, [readonly Effect[]]>();
  const onPreview = jest.fn<void, [readonly Effect[] | undefined]>();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<EffectChainEditor palette={PALETTE} effects={effects} width={244} onChange={onChange} onPreview={onPreview} {...overrides} />);
  });
  const press = (label: string) => {
    const button = renderer.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
    ReactTestRenderer.act(() => button.props.onPress());
  };
  const labels = () => renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && typeof node.props.onPress === 'function').map((node) => node.props.accessibilityLabel as string);
  const texts = () => renderer.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
  return { renderer, press, labels, texts, onChange, onPreview };
}

describe('EffectChainEditor', () => {
  it('says when a track has no effects, and adds the first one from the effect types', () => {
    // Arrange
    const editor = render([]);

    // Act
    editor.press('Add an effect at the end');
    editor.press('Add Delay');

    // Assert
    expect(editor.texts()).toContain('No effects: the track plays its instrument as it is.');
    expect(editor.onChange.mock.calls).toEqual([[[buildEffect('delay')]]]);
  });

  it('switches an effect off, moves it and removes it', () => {
    // Arrange
    const chain = [buildEffect('drive'), buildEffect('reverb')];
    const editor = render(chain);

    // Act
    editor.press('Switch off Drive');
    editor.press('Move Reverb earlier');
    editor.press('Remove Drive');

    // Assert
    expect(editor.onChange.mock.calls.map(([effects]) => effects.map((effect) => `${effect.type}:${effect.isEnabled}`))).toEqual([
      ['drive:false', 'reverb:true'],
      ['reverb:true', 'drive:true'],
      ['reverb:true'],
    ]);
  });

  it('edits the selected effect: a preset, and its sliders heard while dragged', () => {
    // Arrange
    const editor = render([buildEffect('drive'), buildEffect('delay')]);
    editor.press('Edit Delay');

    // Act
    editor.press('Slapback preset');
    const slider = editor.renderer.root.find((node) => node.props.accessibilityLabel === 'Mix' && typeof node.props.onPressIn === 'function');
    ReactTestRenderer.act(() => slider.props.onPressIn({ nativeEvent: { locationX: 0, pageX: 0 } }));

    // Assert
    expect(editor.onChange.mock.calls[0]?.[0][1]?.params).toMatchObject({ time: 110, feedback: 5 });
    expect(editor.onPreview.mock.calls[0]?.[0]?.[1]?.params.mix).toBe(0);
    expect(editor.onPreview.mock.calls[0]?.[0]?.[0]).toEqual(buildEffect('drive'));
  });

  it('replaces the chain with a chain preset', () => {
    const editor = render([]);
    editor.press('Replace the effects with the Crunch chain');
    expect(editor.onChange.mock.calls[0]?.[0].map((effect) => effect.type)).toContain('drive');
  });

  it('keeps a fixed chain (the master) as it is: no presets, no adding, moving or removing', () => {
    const editor = render(DEFAULT_MASTER.effects, { isFixed: true });
    expect(editor.labels().filter((label) => /^(Add|Move|Remove|Replace)/.test(label))).toEqual([]);
    expect(editor.labels()).toContain('Switch on Reverb');
  });
});

describe('MasterStripEditor', () => {
  it('edits the output gain and switches the master effects', () => {
    // Arrange
    const onChange = jest.fn<void, [MasterMix]>();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MasterStripEditor palette={PALETTE} master={DEFAULT_MASTER} width={280} onChange={onChange} onPreview={jest.fn()} />);
    });

    // Act
    const reverb = renderer.root.find((node) => node.props.accessibilityLabel === 'Switch on Reverb' && typeof node.props.onPress === 'function');
    ReactTestRenderer.act(() => reverb.props.onPress());
    const output = renderer.root.find((node) => node.props.accessibilityLabel === 'Output' && typeof node.props.onPressIn === 'function');
    ReactTestRenderer.act(() => output.props.onPressIn({ nativeEvent: { locationX: 0, pageX: 0 } }));
    ReactTestRenderer.act(() => output.props.onPressOut({ nativeEvent: { locationX: 0, pageX: 0 } }));

    // Assert
    expect(onChange.mock.calls[0]?.[0].effects[2]?.isEnabled).toBe(true);
    expect(onChange.mock.calls[1]?.[0].gainDb).toBe(-24);
  });
});
