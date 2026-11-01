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
  it('has Songsterr, AI Compose and AI Edit, usable without a cursor, each running its window command', () => {
    // Arrange
    const palette = render();
    const ids = ['songsterr', 'aiCompose', 'aiEdit'];

    // Act
    ids.forEach((id) => ReactTestRenderer.act(() => palette.tool(id)?.props.onPress()));

    // Assert
    expect(ids.map((id) => palette.tool(id)?.props.label)).toEqual(['Songsterr', 'AI Compose', 'AI Edit']);
    expect(ids.map((id) => palette.tool(id)?.props.isEnabled)).toEqual([true, true, true]);
    expect(palette.onCommand.mock.calls).toEqual([[{ type: 'openSongsterrPanel' }], [{ type: 'openComposePanel' }], [{ type: 'openAiEditPanel' }]]);
  });

  it('names the group and the tools in Korean, the site’s name as it is', () => {
    // Arrange
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act
    const group = onlineGroup();

    // Assert
    expect(group.title).toBe('온라인 도구');
    expect(group.tools.map((tool) => tool.face)).toEqual(['Songsterr', 'AI 작곡', 'AI 수정']);
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

  it('lists AI Edit once, as the Edit menu’s AI Edit… (the palette’s button sends the same command)', () => {
    // Act
    const rows = allCommands().filter((command) => JSON.stringify(command.command) === JSON.stringify({ type: 'openAiEditPanel' }));

    // Assert
    expect(rows.map((command) => [command.id, command.group, command.title])).toEqual([['edit.aiEdit', 'Edit', 'AI Edit…']]);
    expect(rows[0]?.isEnabled({ ...NO_CURSOR_STATE, hasDocument: true })).toBe(true);
  });

  it('finds AI Edit by what it does, in English and in Korean', () => {
    // Arrange
    const find = () => allCommands().find((command) => command.id === 'edit.aiEdit');
    const english = find();
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act
    const korean = find();

    // Assert
    expect(english?.keywords).toEqual(expect.arrayContaining(['fingering', 'lower', 'key', 'easy']));
    expect(english?.keywords).not.toContain('transpose');
    expect(korean?.title).toBe('AI 수정…');
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
