import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import type { Song } from '@gp-editor/core';
import { BarButton } from '../src/components/BarButton';
import { NeckSettings } from '../src/components/NeckSettings';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

const STANDARD = [64, 59, 55, 50, 45, 40];
const DROP_D = [64, 59, 55, 50, 45, 38];
const SEVEN_STRING = [64, 59, 55, 50, 45, 40, 35];

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onSetTuning: jest.Mock;
  readonly onDismissNotice: jest.Mock;
}

function render(song: Song, notice?: string): Rendered {
  const onSetTuning = jest.fn();
  const onDismissNotice = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <NeckSettings song={song} trackIndex={0} notice={notice} palette={PALETTE} onSetTuning={onSetTuning} onDismissNotice={onDismissNotice} />,
    );
  });
  return { renderer, onSetTuning, onDismissNotice };
}

function buttonLabels({ renderer }: Rendered): string[] {
  return renderer.root.findAllByType(BarButton).map((button) => button.props.label as string);
}

function press({ renderer }: Rendered, label: string): void {
  const button = renderer.root.findAllByType(BarButton).find((candidate) => candidate.props.label === label);
  if (button === undefined) {
    throw new Error(`no button "${label}"`);
  }
  ReactTestRenderer.act(() => button.props.onPress());
}

function allText({ renderer }: Rendered): string {
  return renderer.root
    .findAllByType(Text)
    .map((text) => [text.props.children].flat().join(''))
    .join(' | ');
}

describe('NeckSettings', () => {
  it('shows the tuning and a button per preset, ticking the ones that play every note', () => {
    // Arrange: a drop D track whose low D needs a dropped string.
    const rendered = render(onStrings(makeSong([[beat(960, [note(6, 0)])]]), DROP_D));

    // Act
    const labels = buttonLabels(rendered);

    // Assert
    expect(allText(rendered)).toContain('Guitar · 6 strings · Drop D (D A D G B E)');
    expect(labels).toHaveLength(12);
    expect(labels[0]).toBe('Standard');
    expect(labels).toContain('Drop D ✓');
    const active = rendered.renderer.root.findAllByType(BarButton).filter((button) => button.props.isActive === true);
    expect(active.map((button) => button.props.label)).toEqual(['Drop D ✓']);
  });

  it('applies a preset when it is clicked', () => {
    const rendered = render(onStrings(makeSong([[beat(960, [note(6, 0)])]]), DROP_D));
    press(rendered, 'Standard');
    expect(rendered.onSetTuning).toHaveBeenCalledWith(STANDARD);
  });

  it('explains why a track needs another tuning and applies a suggestion in one click', () => {
    // Arrange: a 7-string part that never goes below E2.
    const rendered = render(onStrings(makeSong([[beat(960, [note(6, 0)])]]), SEVEN_STRING));

    // Act
    press(rendered, 'Use Standard');

    // Assert
    expect(allText(rendered)).toContain('This track has 7 strings; the guitar neck has 6.');
    expect(rendered.onSetTuning).toHaveBeenCalledWith(STANDARD);
  });

  it('shows the notice of the last retune until it is dismissed', () => {
    const rendered = render(makeSong([[beat(960, [note(1, 0)])]]), 'Retuned: 1 note moved by an octave.');
    expect(allText(rendered)).toContain('Retuned: 1 note moved by an octave.');
    press(rendered, 'Dismiss');
    expect(rendered.onDismissNotice).toHaveBeenCalled();
  });

  it('shows nothing for a percussion track', () => {
    const rendered = render(onStrings(makeSong([[]]), [0, 0, 0, 0, 0, 0], { isPercussion: true }));
    expect(rendered.renderer.toJSON()).toBeNull();
  });
});
