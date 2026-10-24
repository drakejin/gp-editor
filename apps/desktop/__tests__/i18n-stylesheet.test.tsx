import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_STYLESHEET } from '@gp-editor/core';
import { BarButton } from '../src/components/BarButton';
import { DesignModeBar } from '../src/components/stylesheet/DesignModeBar';
import { StylesheetPanel } from '../src/components/stylesheet/StylesheetPanel';
import { SystemDesignButtons } from '../src/components/SystemDesignButtons';
import type { CommandState } from '../src/lib/command-types';
import { searchCommands } from '../src/lib/command-search';
import { appCommands } from '../src/lib/commands';
import { SAVE_FORMATS, saveHint } from '../src/lib/file-formats';
import { setLanguage } from '../src/lib/i18n/i18n';
import { shortcutGroups } from '../src/lib/shortcuts';
import { pageSummary, textStyleText } from '../src/lib/stylesheet-draft';
import { PALETTE } from '../test-support/score-helpers';
import { header, makeSong } from '../test-support/songs';

const OPEN_DOCUMENT: CommandState = { hasDocument: true, hasSelection: false, canUndo: false, canRedo: false, tabCount: 1, isPercussion: false, palette: { keySignature: 0 } };

afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));

function korean(): void {
  ReactTestRenderer.act(() => setLanguage('ko'));
}

function buttonLabels(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(BarButton).map((button) => button.props.label as string);
}

function shownTexts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
}

function pressTab(renderer: ReactTestRenderer.ReactTestRenderer, label: string): void {
  const tab = renderer.root.findAllByType(BarButton).find((button) => button.props.label === label);
  ReactTestRenderer.act(() => tab?.props.onPress());
}

describe('the Stylesheet dialog in Korean', () => {
  it('names Guitar Pro 8’s five tabs and the page’s values in Korean, the paper names as they are', () => {
    // Arrange
    korean();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    // Act
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<StylesheetPanel palette={PALETTE} sheet={DEFAULT_STYLESHEET} onChange={jest.fn()} onClose={jest.fn()} />);
    });

    // Assert
    const labels = buttonLabels(renderer);
    expect(labels.slice(0, 5)).toEqual(['페이지와 악보 형식', '단과 보표', '머리말과 꼬리말', '텍스트와 스타일', '기보']);
    expect(labels).toEqual(expect.arrayContaining(['A4', 'US Letter', '사용자 지정', '세로', '가로', '기본 스타일시트', '닫기']));
    expect(shownTexts(renderer)).toEqual(expect.arrayContaining(['스타일시트', '여백', '위쪽', '배율', 'A4 · 세로 · 210 × 297 mm']));
  });

  it('shows every tab’s labels in Korean, technique labels by the glossary’s names', () => {
    // Arrange
    korean();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<StylesheetPanel palette={PALETTE} sheet={DEFAULT_STYLESHEET} onChange={jest.fn()} onClose={jest.fn()} />);
    });

    // Act
    pressTab(renderer, '단과 보표');
    const systems = [...buttonLabels(renderer), ...shownTexts(renderer)];
    pressTab(renderer, '머리말과 꼬리말');
    const headerTab = [...buttonLabels(renderer), ...shownTexts(renderer)];
    pressTab(renderer, '텍스트와 스타일');
    const texts = [...buttonLabels(renderer), ...shownTexts(renderer)];
    pressTab(renderer, '기보');
    const notation = [...buttonLabels(renderer), ...shownTexts(renderer)];

    // Assert
    expect(systems).toEqual(expect.arrayContaining(['단 사이', '한 단의 마디 수', '자동', '세로줄을 단 전체에 잇기', '전체 이름', '줄인 이름']));
    expect(headerTab).toEqual(expect.arrayContaining(['작사', '작곡', '타브 작성자', '제목과 페이지 번호', '머리말', '꼬리말']));
    expect(texts).toEqual(expect.arrayContaining(['서체', '시스템', '볼드체', '박 텍스트', '마디 번호', '단의 첫 마디', '제목: 시스템 서체, 26 pt, 볼드체']));
    expect(notation).toEqual(expect.arrayContaining(['팜뮤트', '트레몰로 바', '팜뮤트 표기', '적용', '쉼표 위로 기호 선 잇기', '4/4·2/2 박자를 C로 표시']));
  });

  it('writes a page and a text style in Korean', () => {
    // Arrange
    korean();

    // Act
    const custom = pageSummary({ ...DEFAULT_STYLESHEET.page, format: 'custom', orientation: 'landscape', customWidth: 200, customHeight: 300 });
    const style = textStyleText({ family: 'Georgia', size: 11, isBold: false, isItalic: true });

    // Assert
    expect(custom).toBe('사용자 지정 · 가로 · 300 × 200 mm');
    expect(style).toBe('Georgia, 11 pt, 이탤릭체');
  });
});

describe('Design Mode in Korean', () => {
  it('labels its strip and the buttons beside a system in Korean', () => {
    // Arrange
    korean();
    const song = makeSong([[], [], []], [header(1), header(2, { design: { systemBars: 0 } }), header(3)]);
    let bar!: ReactTestRenderer.ReactTestRenderer;
    let buttons!: ReactTestRenderer.ReactTestRenderer;

    // Act
    ReactTestRenderer.act(() => {
      bar = ReactTestRenderer.create(<DesignModeBar palette={PALETTE} song={song} cursorMeasureIndex={1} onAction={jest.fn()} />);
      buttons = ReactTestRenderer.create(<SystemDesignButtons palette={PALETTE} song={song} firstMeasureIndex={0} barCount={2} onEdit={jest.fn()} />);
    });

    // Assert
    expect(buttonLabels(bar)).toEqual(['마디 2의 단 시작 해제', '위치 초기화', '완료']);
    expect(shownTexts(bar)[0]).toBe('디자인 모드');
    const tooltips = new Set(buttons.root.findAll((node) => typeof node.props.tooltip === 'string').map((node) => node.props.tooltip as string));
    expect([...tooltips]).toEqual(['이 단에 마디 하나 더 넣기', '이 단에서 마디 하나 빼기', '이 단 초기화: 마디 너비, 박 위치, 마디 수를 자동 배치로 되돌립니다']);
  });
});

describe('the stylesheet’s commands and hints in Korean', () => {
  it('finds the Stylesheet, Design Mode and Reset Positions by Korean words and by English ones', () => {
    // Arrange
    korean();
    const ids = (query: string): string[] => searchCommands(appCommands(), query, OPEN_DOCUMENT, []).map((match) => match.command.id);

    // Act
    const byKorean = ids('스타일');
    const byEnglish = ids('stylesheet');

    // Assert
    expect(byKorean[0]).toBe('file.stylesheet');
    expect(byEnglish[0]).toBe('file.stylesheet');
    expect(appCommands().find((command) => command.id === 'file.stylesheet')).toMatchObject({ title: '스타일시트…', group: '파일', shortcut: 'F7' });
    expect(ids('디자인')[0]).toBe('view.designMode');
    expect(ids('위치 초기화')[0]).toBe('view.resetPositions');
  });

  it('lists F7 on the shortcut sheet and says in Korean what a GP5 file leaves out of the layout', () => {
    // Arrange
    korean();
    const designed = makeSong([[]], [header(1, { design: { systemBars: 0 } })]);
    const gp5 = SAVE_FORMATS.find((format) => format.id === 'gp5');

    // Act
    const rows = shortcutGroups().flatMap((group) => group.shortcuts);
    const hint = gp5 === undefined ? undefined : saveHint(gp5, designed);

    // Assert
    expect(rows.find((row) => row.keys === 'F7')?.action).toBe('파일 ▸ 스타일시트…: 악보의 페이지, 단, 텍스트, 기보 설정');
    expect(hint).toBe('Guitar Pro 5 파일에는 스타일시트와 디자인 모드 레이아웃이 저장되지 않습니다. 남기려면 Guitar Pro 7/8 (.gp)로 저장하세요.');
  });
});
