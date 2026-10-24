import ReactTestRenderer from 'react-test-renderer';
import { TextInput } from 'react-native';
import { DEFAULT_STYLESHEET, type Stylesheet } from '@gp-editor/core';
import { BarButton } from '../src/components/BarButton';
import { DesignModeBar } from '../src/components/stylesheet/DesignModeBar';
import { StylesheetPanel } from '../src/components/stylesheet/StylesheetPanel';
import type { EditorAction } from '../src/state/editor';
import { PALETTE } from '../test-support/score-helpers';
import { header, makeSong } from '../test-support/songs';

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onChange: jest.Mock<void, [Stylesheet]>;
  readonly onClose: jest.Mock;
}

function render(sheet: Stylesheet = DEFAULT_STYLESHEET): Rendered {
  const onChange = jest.fn<void, [Stylesheet]>();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<StylesheetPanel palette={PALETTE} sheet={sheet} onChange={onChange} onClose={onClose} />);
  });
  return { renderer, onChange, onClose };
}

function press({ renderer }: Rendered, label: string, index = 0): void {
  const found = renderer.root.findAllByType(BarButton).filter((candidate) => candidate.props.label === label)[index];
  if (found === undefined) {
    throw new Error(`no button "${label}"`);
  }
  ReactTestRenderer.act(() => found.props.onPress());
}

const lastChange = (rendered: Rendered): Stylesheet => rendered.onChange.mock.calls.at(-1)![0];

describe('StylesheetPanel', () => {
  it('shows Guitar Pro 8’s five tabs, the page first', () => {
    const rendered = render();
    const labels = rendered.renderer.root.findAllByType(BarButton).map((button) => button.props.label as string);
    expect(labels.slice(0, 5)).toEqual(['Page & Score Format', 'Systems & Staves', 'Header & Footer', 'Texts & Styles', 'Notation']);
    expect(labels).toContain('Landscape');
  });

  it('sends the stylesheet with one value changed for every press', () => {
    // Arrange
    const rendered = render();

    // Act
    press(rendered, 'US Letter');
    const letter = lastChange(rendered);
    press(rendered, '+', 4);
    const scaled = lastChange(rendered);

    // Assert
    expect(letter.page.format).toBe('letter');
    expect(scaled.scale).toBe(1.05);
    expect(rendered.onChange).toHaveBeenCalledTimes(2);
  });

  it('changes the spacing, bars per system and track names on Systems & Staves', () => {
    // Arrange
    const rendered = render();
    press(rendered, 'Systems & Staves');

    // Act
    press(rendered, '+', 0);
    const spaced = lastChange(rendered);
    press(rendered, '+', 3);
    const bars = lastChange(rendered);
    press(rendered, 'None', 1);
    const names = lastChange(rendered);

    // Assert
    expect(spaced.systems.systemSpacing).toBe(2);
    expect(bars.systems.barsPerSystem).toBe(1);
    expect(names.systems.otherSystemNames).toBe('hidden');
  });

  it('sets a text’s font, size and style on Texts & Styles, and where the lyrics go', () => {
    // Arrange
    const rendered = render();
    press(rendered, 'Texts & Styles');
    press(rendered, 'Lyrics');

    // Act
    press(rendered, 'Georgia');
    const font = lastChange(rendered);
    press(rendered, 'Italic');
    const italic = lastChange(rendered);
    press(rendered, 'Above');
    const above = lastChange(rendered);

    // Assert
    expect(font.texts.lyrics.family).toBe('Georgia');
    expect(italic.texts.lyrics.isItalic).toBe(true);
    expect(above.lyrics).toBe('above');
  });

  it('renames a label when Set is pressed, once, and turns the notation options on and off', () => {
    // Arrange
    const rendered = render();
    press(rendered, 'Notation');
    const field = rendered.renderer.root.findAllByType(TextInput).find((input) => input.props.testID === 'stylesheet-label')!;

    // Act
    ReactTestRenderer.act(() => field.props.onChangeText('PM'));
    press(rendered, 'Set');
    const renamed = lastChange(rendered);
    press(rendered, 'C for 4/4 and 2/2');

    // Assert
    expect(renamed.notation.labels.palmMute).toBe('PM');
    expect(rendered.onChange).toHaveBeenCalledTimes(2);
    expect(lastChange(rendered).notation.showsCommonTime).toBe(true);
  });

  it('goes back to the default stylesheet, and closes', () => {
    // Arrange
    const rendered = render({ ...DEFAULT_STYLESHEET, scale: 1.5 });

    // Act
    press(rendered, 'Default Stylesheet');
    press(rendered, 'Close');

    // Assert
    expect(lastChange(rendered)).toBe(DEFAULT_STYLESHEET);
    expect(rendered.onClose).toHaveBeenCalled();
  });
});

describe('DesignModeBar', () => {
  function renderBar(song = makeSong([[], [], []], [header(1), header(2, { design: { systemBars: 0 } }), header(3)]), cursorMeasureIndex = 1) {
    const actions: EditorAction[] = [];
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<DesignModeBar palette={PALETTE} song={song} cursorMeasureIndex={cursorMeasureIndex} onAction={(action) => actions.push(action)} />);
    });
    const labels = renderer.root.findAllByType(BarButton).map((button) => button.props.label as string);
    const pressAll = () => renderer.root.findAllByType(BarButton).forEach((button) => ReactTestRenderer.act(() => button.props.onPress()));
    return { labels, actions, pressAll };
  }

  it('starts or ends a system at the cursor’s bar, resets the positions and turns Design Mode off', () => {
    // Act
    const bar = renderBar();
    bar.pressAll();

    // Assert
    expect(bar.labels).toEqual(['No system start at bar 2', 'Reset Positions', 'Done']);
    expect(bar.actions).toEqual([{ type: 'toggleSystemStart', measureIndex: 1 }, { type: 'resetPositions' }, { type: 'toggleDesignMode' }]);
  });
});
