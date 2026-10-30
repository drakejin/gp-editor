import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { EditionPalette } from '../src/components/palette/EditionPalette';
import { onlineGroup } from '../src/components/palette/palette-online';
import type { CommandState } from '../src/lib/command-types';
import { allCommands } from '../src/lib/commands';
import { setLanguage } from '../src/lib/i18n/i18n';
import { PALETTE } from '../test-support/score-helpers';
import { makeSong } from '../test-support/songs';

afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));

const NO_CURSOR_STATE: CommandState = {
  hasDocument: false,
  hasSelection: false,
  canUndo: false,
  canRedo: false,
  tabCount: 0,
  isPercussion: false,
  palette: { keySignature: 0 },
};

function render() {
  const onCommand = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<EditionPalette palette={PALETTE} song={makeSong([])} onEdit={jest.fn()} onAction={jest.fn()} onOpenPanel={jest.fn()} onCommand={onCommand} />);
  });
  const tool = (id: string) => renderer.root.findAllByType(ChromeButton).find((button) => button.props.testID === `palette-${id}`);
  return { onCommand, tool };
}

describe('the palette’s ONLINE TOOLS', () => {
  it('has Songsterr and AI Compose, usable without a cursor, each running its window command', () => {
    // Arrange
    const palette = render();

    // Act
    ReactTestRenderer.act(() => palette.tool('songsterr')?.props.onPress());
    ReactTestRenderer.act(() => palette.tool('aiCompose')?.props.onPress());

    // Assert
    expect([palette.tool('songsterr')?.props.label, palette.tool('aiCompose')?.props.label]).toEqual(['Songsterr', 'AI Compose']);
    expect([palette.tool('songsterr')?.props.isEnabled, palette.tool('aiCompose')?.props.isEnabled]).toEqual([true, true]);
    expect(palette.onCommand.mock.calls).toEqual([[{ type: 'openSongsterrPanel' }], [{ type: 'openComposePanel' }]]);
  });

  it('names the group and the tools in Korean, the site’s name as it is', () => {
    // Arrange
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act
    const group = onlineGroup();

    // Assert
    expect(group.title).toBe('온라인 도구');
    expect(group.tools.map((tool) => tool.face)).toEqual(['Songsterr', 'AI 작곡']);
  });
});

describe('the command palette’s online tools', () => {
  it('lists the Songsterr search once, as Tools ▸ Songsterr Search…, usable without a document', () => {
    // Act
    const rows = allCommands().filter((command) => JSON.stringify(command.command) === JSON.stringify({ type: 'openSongsterrPanel' }));

    // Assert
    expect(rows.map((command) => [command.id, command.group, command.title])).toEqual([['tools.songsterr', 'Tools', 'Songsterr Search…']]);
    expect(rows[0]?.isEnabled(NO_CURSOR_STATE)).toBe(true);
  });

  it('lists AI Compose once, as the Edit menu’s Compose from Here (the palette’s button sends the same command)', () => {
    // Act
    const rows = allCommands().filter((command) => JSON.stringify(command.command) === JSON.stringify({ type: 'openComposePanel' }));

    // Assert
    expect(rows.map((command) => command.id)).toEqual(['edit.composeHere']);
    expect(rows[0]?.title).toBe('Compose from Here…');
  });

  it('finds the Songsterr search by its English words in Korean', () => {
    // Arrange
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act
    const row = allCommands().find((command) => command.id === 'tools.songsterr');

    // Assert
    expect(row?.title).toBe('Songsterr 검색…');
    expect(row?.keywords).toEqual(expect.arrayContaining(['online', 'tabs', 'Songsterr Search…']));
  });
});
