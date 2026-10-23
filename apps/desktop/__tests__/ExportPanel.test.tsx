import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import type { Song } from '@gp-editor/core';
import { BarButton } from '../src/components/BarButton';
import { ExportPanel } from '../src/components/ExportPanel';
import { pdfPageCount } from '../src/export/pdf-document';
import type { ExportFormat } from '../src/hooks/use-pdf-export';
import type { ScoreMode } from '../src/score/geometry';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const SAVE = 'Save PDF…';

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onSave: jest.Mock;
  readonly onSavePng: jest.Mock;
  readonly onClose: jest.Mock;
}

const song: Song = makeSong(Array.from({ length: 40 }, (_, i) => [beat(header(i + 1).start, [note(1, i % 5)])]));

function render(mode: ScoreMode = 'notationAndTab', isSaving = false, format: ExportFormat = 'pdf', exportSong: Song = song): Rendered {
  const onSave = jest.fn();
  const onSavePng = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <ExportPanel
        palette={PALETTE}
        song={exportSong}
        trackIndex={0}
        fileName="Song.gp5"
        mode={mode}
        format={format}
        isSaving={isSaving}
        onSave={onSave}
        onSavePng={onSavePng}
        onClose={onClose}
      />,
    );
  });
  return { renderer, onSave, onSavePng, onClose };
}

function button({ renderer }: Rendered, label: string): ReactTestRenderer.ReactTestInstance {
  const found = renderer.root.findAllByType(BarButton).find((candidate) => candidate.props.label === label);
  if (found === undefined) {
    throw new Error(`no button "${label}"`);
  }
  return found;
}

function press(rendered: Rendered, label: string): void {
  ReactTestRenderer.act(() => button(rendered, label).props.onPress());
}

function activeLabels({ renderer }: Rendered): string[] {
  return renderer.root.findAllByType(BarButton).filter((b) => b.props.isActive === true).map((b) => b.props.label as string);
}

function allText({ renderer }: Rendered): string {
  return renderer.root
    .findAllByType(Text)
    .map((text) => [text.props.children].flat().join(''))
    .join(' | ');
}

describe('ExportPanel', () => {
  it('offers the three modes and two papers, starting from the view mode and A4', () => {
    const rendered = render('tab');
    const labels = rendered.renderer.root.findAllByType(BarButton).map((b) => b.props.label);
    expect(labels).toEqual(['Score + Tab', 'Score', 'Tab', 'A4', 'US Letter', SAVE, 'Close']);
    expect(activeLabels(rendered)).toEqual(['Tab', 'A4']);
  });

  it('shows how many pages the PDF will have, following the chosen mode and paper', () => {
    // Arrange
    const rendered = render('notationAndTab');
    const tabLetterPages = pdfPageCount(song, 0, 'tab', { paper: 'letter', fileName: 'Song.gp5' });

    // Act
    press(rendered, 'Tab');
    press(rendered, 'US Letter');

    // Assert
    expect(activeLabels(rendered)).toEqual(['Tab', 'US Letter']);
    expect(allText(rendered)).toContain(tabLetterPages === 1 ? '1 page' : `${tabLetterPages} pages`);
  });

  it('saves with the chosen mode and paper', () => {
    const rendered = render('notationAndTab');
    press(rendered, 'Score');
    press(rendered, 'US Letter');
    press(rendered, SAVE);
    expect(rendered.onSave).toHaveBeenCalledWith('notation', 'letter');
  });

  it('closes without saving', () => {
    const rendered = render();
    press(rendered, 'Close');
    expect(rendered.onClose).toHaveBeenCalled();
    expect(rendered.onSave).not.toHaveBeenCalled();
  });

  it('disables Save PDF… while a save is under way', () => {
    const rendered = render('tab', true);
    expect(button(rendered, SAVE).props.isEnabled).toBe(false);
    expect(allText(rendered)).toContain('Saving…');
  });
});

describe('ExportPanel for PNG images', () => {
  const SAVE_PNG = 'Save PNG…';

  it('adds the resolution and the background, starting at 150 dpi on a white page', () => {
    const rendered = render('tab', false, 'png');
    const labels = rendered.renderer.root.findAllByType(BarButton).map((b) => b.props.label);
    expect(labels).toEqual(['Score + Tab', 'Score', 'Tab', 'A4', 'US Letter', '72 dpi', '150 dpi', '300 dpi', 'White', 'Transparent', SAVE_PNG, 'Close']);
    expect(activeLabels(rendered)).toEqual(['Tab', 'A4', '150 dpi', 'White']);
    expect(allText(rendered)).toContain('Export PNG');
  });

  it('saves with the chosen mode, paper, resolution and background', () => {
    // Arrange
    const rendered = render('notationAndTab', false, 'png');

    // Act
    press(rendered, 'Score');
    press(rendered, 'US Letter');
    press(rendered, '300 dpi');
    press(rendered, 'Transparent');
    press(rendered, SAVE_PNG);

    // Assert
    expect(rendered.onSavePng).toHaveBeenCalledWith('notation', 'letter', { dpi: 300, isTransparent: true });
    expect(rendered.onSave).not.toHaveBeenCalled();
  });

  it('names the files it will write and their size in pixels', () => {
    // Arrange
    const rendered = render('tab', false, 'png');
    const pages = pdfPageCount(song, 0, 'tab', { paper: 'a4', fileName: 'Song.gp5' });

    // Act
    press(rendered, '300 dpi');

    // Assert
    const text = allText(rendered);
    expect(text).toContain(pages === 1 ? 'Song (Tab).png' : `${pages} pages → Song (Tab)-1.png`);
    expect(text).toContain('2479 × 3508 px');
  });

  it('names the single file of a one-page export', () => {
    const rendered = render('tab', false, 'png', makeSong([[beat(header(1).start, [note(1, 0)])]]));
    expect(allText(rendered)).toContain('1 page → Song (Tab).png, 1240 × 1754 px');
  });
});
