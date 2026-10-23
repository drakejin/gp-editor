import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { CommandPalette } from '../src/components/CommandPalette';
import type { Command, CommandState } from '../src/lib/command-types';
import { COMMANDS } from '../src/lib/commands';
import { PALETTE } from '../test-support/score-helpers';

const STATE: CommandState = { hasDocument: true, hasSelection: false, canUndo: false, canRedo: false, tabCount: 1, isPercussion: false, palette: { keySignature: 0 } };

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onRun: jest.Mock<void, [Command]>;
  readonly onClose: jest.Mock;
}

function render(recentIds: readonly string[] = [], state: CommandState = STATE): Rendered {
  const onRun = jest.fn<void, [Command]>();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<CommandPalette palette={PALETTE} commands={COMMANDS} state={state} recentIds={recentIds} onRun={onRun} onClose={onClose} />);
  });
  return { renderer, onRun, onClose };
}

function field({ renderer }: Rendered): ReactTestRenderer.ReactTestInstance {
  return renderer.root.findByType(TextInput);
}

function type(rendered: Rendered, text: string): void {
  ReactTestRenderer.act(() => field(rendered).props.onChangeText(text));
}

function key(rendered: Rendered, name: string): void {
  ReactTestRenderer.act(() => field(rendered).props.onKeyDown({ nativeEvent: { key: name }, stopPropagation: jest.fn() }));
}

/** Titles of the listed rows, the highlighted one marked with `>`. */
function rows({ renderer }: Rendered): string[] {
  return renderer.root
    .findAll((node) => typeof node.props.testID === 'string' && /^command-(?!palette-)/.test(node.props.testID) && node.props.onPress !== undefined)
    .map((row) => {
      const title = row.findAllByType(Text)[0]?.props.children as string;
      const style = [row.props.style].flat(3) as ({ backgroundColor?: string } | null)[];
      return style.some((part) => part?.backgroundColor === PALETTE.chromeAccent) ? `>${title}` : title;
    });
}

describe('CommandPalette', () => {
  it('lists recently run commands first, the first one highlighted', () => {
    const rendered = render(['tools.transpose', 'file.exportMidi']);
    expect(rows(rendered).slice(0, 3)).toEqual(['>Transpose…', 'Export MIDI…', 'New Score + Tab']);
  });

  it('keeps its keys out of the score and claims ↑, ↓ and ↩ for the list', () => {
    const rendered = render();
    expect(field(rendered).props.keyDownEvents).toEqual([{ key: 'ArrowUp' }, { key: 'ArrowDown' }, { key: 'Enter' }]);
    const event = { nativeEvent: { key: 'x' }, stopPropagation: jest.fn() };
    ReactTestRenderer.act(() => field(rendered).props.onKeyDown(event));
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('finds “exp pdf” and runs it with ↩', () => {
    // Arrange
    const rendered = render();

    // Act
    type(rendered, 'exp pdf');
    key(rendered, 'Enter');

    // Assert
    expect(rows(rendered)[0]).toBe('>Export PDF…');
    expect(rendered.onRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'file.exportPdf' }));
  });

  it('moves the highlight with ↓ and ↑, going round', () => {
    const rendered = render();
    type(rendered, 'export');
    key(rendered, 'ArrowDown');
    expect(rows(rendered)[1]?.startsWith('>')).toBe(true);
    key(rendered, 'ArrowUp');
    key(rendered, 'ArrowUp');
    const listed = rows(rendered);
    expect(listed[listed.length - 1]?.startsWith('>')).toBe(true);
  });

  it('runs a clicked row, shows its key, and closes from the backdrop', () => {
    // Arrange
    const rendered = render();
    type(rendered, 'save as');

    // Act
    const row = rendered.renderer.root.findByProps({ testID: 'command-file.saveAs' });
    ReactTestRenderer.act(() => row.props.onPress());
    ReactTestRenderer.act(() => rendered.renderer.root.findByProps({ testID: 'command-palette-backdrop' }).props.onPress());

    // Assert
    expect(rendered.onRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'file.saveAs' }));
    expect(row.findAllByType(Text).map((text) => text.props.children)).toEqual(['Save As…', 'File', '⇧⌘S']);
    expect(rendered.onClose).toHaveBeenCalled();
  });

  it('does not run a command that cannot run now, and says when nothing matches', () => {
    const rendered = render([], { ...STATE, hasDocument: false });
    type(rendered, 'exp pdf');
    key(rendered, 'Enter');
    expect(rendered.onRun).not.toHaveBeenCalled();
    type(rendered, 'zzzz');
    expect(rendered.renderer.root.findAllByType(Text).some((text) => text.props.children?.[0] === 'No command matches “')).toBe(true);
  });
});
