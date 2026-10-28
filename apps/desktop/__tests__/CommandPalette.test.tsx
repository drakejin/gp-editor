import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { CommandPalette } from '../src/components/CommandPalette';
import type { Command, CommandState } from '../src/lib/command-types';
import { allCommands } from '../src/lib/commands';
import { setLanguage } from '../src/lib/i18n/i18n';
import { paletteContext } from '../src/components/palette/palette-tools';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const STATE: CommandState = { hasDocument: true, hasSelection: false, canUndo: false, canRedo: false, tabCount: 1, isPercussion: false, palette: { keySignature: 0 } };

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onRun: jest.Mock<void, [Command]>;
  readonly onClose: jest.Mock;
}

function render(recentIds: readonly string[] = [], state: CommandState = STATE, initialQuery?: string): Rendered {
  const onRun = jest.fn<void, [Command]>();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <CommandPalette palette={PALETTE} commands={allCommands()} state={state} recentIds={recentIds} onRun={onRun} onClose={onClose} initialQuery={initialQuery} />,
    );
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

  it('keeps its keys out of the score and claims ↑, ↓ and ↩ for the list, in a field that hands every key to JS', () => {
    const rendered = render();
    expect(field(rendered).props.keyDownEvents).toEqual([{ key: 'ArrowUp' }, { key: 'ArrowDown' }, { key: 'Enter' }]);
    expect(field(rendered).props.multiline).toBe(true);
    type(rendered, 'exp\npdf');
    expect(field(rendered).props.value).toBe('exppdf');
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
    expect(rendered.renderer.root.findAllByType(Text).some((text) => text.props.children === 'No command matches “zzzz”.')).toBe(true);
  });
});

describe('CommandPalette: Expression Text', () => {
  const texts = ({ renderer }: Rendered): string[] => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));

  it('opens on “>” from Tools ▸ Expression Text…, naming what can be typed, and lists the expressions to choose from', () => {
    // Act
    const rendered = render([], STATE, '>');

    // Assert
    expect(field(rendered).props.value).toBe('>');
    expect(texts(rendered)).toContain('Expression Text');
    expect(rows(rendered)[0]).toBe('>ppp (pianississimo)');
  });

  it('turns “>ff” typed in the palette into the dynamic and runs it with ↩', () => {
    // Arrange
    const song = makeSong([[beat(960, [note(1, 3)])]]);
    const onNote: CommandState = { ...STATE, palette: paletteContext(song, { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 }) };
    const rendered = render([], onNote);

    // Act
    type(rendered, '>ff');
    key(rendered, 'Enter');

    // Assert
    expect(rows(rendered)[0]).toBe('>ff (fortissimo)');
    expect(rendered.onRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'expression.dynamic.ff', group: 'Dynamic' }));
  });

  it('greys an expression the cursor cannot take and says when nothing matches', () => {
    // Arrange
    const rendered = render([], { ...STATE, hasDocument: false }, '>');

    // Act
    type(rendered, '>8va');
    key(rendered, 'Enter');
    type(rendered, '>banana');

    // Assert
    expect(rendered.onRun).not.toHaveBeenCalled();
    expect(texts(rendered).some((text) => text.startsWith('Nothing matches “banana”'))).toBe(true);
  });
});

describe('CommandPalette in Korean', () => {
  beforeEach(() => ReactTestRenderer.act(() => setLanguage('ko')));
  afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));
  const shown = ({ renderer }: Rendered): string[] => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));

  it('lists Korean titles, finds them by 초성 and by English, and says what the keys do in Korean', () => {
    // Arrange
    const rendered = render();

    // Act
    type(rendered, 'ㅌㄴ');
    const byInitials = rows(rendered)[0];
    type(rendered, 'transpose');
    const byEnglish = rows(rendered)[0];
    type(rendered, '바나나');

    // Assert
    expect([byInitials, byEnglish]).toEqual(['>튜너…', '>조옮김…']);
    expect(field(rendered).props.placeholder).toBe('명령을 입력하세요 (예: pdf 내보내기, 조옮김, ㅈㅇㄱ)');
    expect(shown(rendered)).toEqual(expect.arrayContaining(['“바나나”에 맞는 명령이 없습니다.', '명령 0개 · ↑ ↓ 고르기 · ↩ 실행 · Esc 닫기']));
  });

  it('names Expression Text and its kinds in Korean', () => {
    const rendered = render([], STATE, '>');

    type(rendered, '>낮은음');

    expect(shown(rendered)).toEqual(expect.arrayContaining(['표현 텍스트', '낮은음자리표 (F)', '음자리표']));
  });
});
