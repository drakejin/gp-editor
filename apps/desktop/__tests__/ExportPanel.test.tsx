import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { DEFAULT_STYLESHEET, type Song, setBeatAnnotation, setStylesheet } from '@gp-editor/core';
import { BarButton } from '../src/components/BarButton';
import { ExportPanel } from '../src/components/ExportPanel';
import { pdfPageCount } from '../src/export/pdf-document';
import type { ExportFormat } from '../src/hooks/use-pdf-export';
import type { ScoreMode } from '../src/score/geometry';
import type { StaffSpec } from '../src/score/score-layout';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux, withTrack } from '../test-support/songs';

const SAVE = 'Save PDF…';

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onSave: jest.Mock;
  readonly onSavePng: jest.Mock;
  readonly onClose: jest.Mock;
  readonly onOpenStylesheet: jest.Mock;
}

const song: Song = makeSong(Array.from({ length: 40 }, (_, i) => [beat(toTux(header(i + 1).start), [note(1, i % 5)])]));

function render(mode: ScoreMode = 'notationAndTab', isSaving = false, format: ExportFormat = 'pdf', exportSong: Song = song, staves?: readonly StaffSpec[]): Rendered {
  const onSave = jest.fn();
  const onSavePng = jest.fn();
  const onClose = jest.fn();
  const onOpenStylesheet = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <ExportPanel
        palette={PALETTE}
        song={exportSong}
        trackIndex={0}
        staves={staves}
        fileName="Song.gp5"
        mode={mode}
        format={format}
        isSaving={isSaving}
        onSave={onSave}
        onSavePng={onSavePng}
        onClose={onClose}
        onOpenStylesheet={onOpenStylesheet}
      />,
    );
  });
  return { renderer, onSave, onSavePng, onClose, onOpenStylesheet };
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
  it('offers the three modes, starting from the view mode, on the stylesheet’s page', () => {
    const rendered = render('tab');
    const labels = rendered.renderer.root.findAllByType(BarButton).map((b) => b.props.label);
    expect(labels).toEqual(['Score + Tab', 'Score', 'Tab', 'Stylesheet…', SAVE, 'Close']);
    expect(activeLabels(rendered)).toEqual(['Tab']);
    expect(allText(rendered)).toContain('A4 · portrait · 210 × 297 mm');
  });

  it('shows how many pages the PDF will have, following the chosen mode and the stylesheet’s page', () => {
    // Arrange
    const onLetter = setStylesheet(song, { ...DEFAULT_STYLESHEET, page: { ...DEFAULT_STYLESHEET.page, format: 'letter', orientation: 'landscape' } });
    const rendered = render('notationAndTab', false, 'pdf', onLetter);
    const tabLetterPages = pdfPageCount(onLetter, 0, 'tab', { fileName: 'Song.gp5' });

    // Act
    press(rendered, 'Tab');

    // Assert
    expect(allText(rendered)).toContain('US Letter · landscape · 279 × 216 mm');
    expect(allText(rendered)).toContain(tabLetterPages === 1 ? '1 page' : `${tabLetterPages} pages`);
  });

  it('saves with the chosen mode, and opens the stylesheet for the page', () => {
    const rendered = render('notationAndTab');
    press(rendered, 'Score');
    press(rendered, SAVE);
    press(rendered, 'Stylesheet…');
    expect(rendered.onSave).toHaveBeenCalledWith('notation');
    expect(rendered.onOpenStylesheet).toHaveBeenCalled();
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

describe('ExportPanel in the multitrack view', () => {
  const duet = withTrack(song, song.tracks[0]!.measures.map((m) => m.beats), { name: 'Bass' });
  const staves: readonly StaffSpec[] = [{ trackIndex: 0, mode: 'notationAndTab' }, { trackIndex: 1, mode: 'tab' }];

  it('exports the shown tracks as shown, or all of them in one mode', () => {
    // Arrange
    const rendered = render('notationAndTab', false, 'pdf', duet, staves);
    const asShownPages = pdfPageCount(duet, 0, 'notationAndTab', { fileName: 'Song.gp5', staves });

    // Act + Assert: As Shown first and chosen
    expect(rendered.renderer.root.findAllByType(BarButton).map((b) => b.props.label).slice(0, 4)).toEqual(['As Shown', 'Score + Tab', 'Score', 'Tab']);
    expect(activeLabels(rendered)).toEqual(['As Shown']);
    expect(allText(rendered)).toContain('2 tracks as the score shows them');
    expect(allText(rendered)).toContain(asShownPages === 1 ? '1 page' : `${asShownPages} pages`);
    press(rendered, SAVE);
    press(rendered, 'Tab');
    press(rendered, SAVE);
    expect(rendered.onSave.mock.calls).toEqual([['asShown'], ['tab']]);
  });
});

describe('ExportPanel for PNG images', () => {
  const SAVE_PNG = 'Save PNG…';

  it('adds the resolution and the background, starting at 150 dpi on a white page', () => {
    const rendered = render('tab', false, 'png');
    const labels = rendered.renderer.root.findAllByType(BarButton).map((b) => b.props.label);
    expect(labels).toEqual(['Score + Tab', 'Score', 'Tab', 'Stylesheet…', '72 dpi', '150 dpi', '300 dpi', 'White', 'Transparent', SAVE_PNG, 'Close']);
    expect(activeLabels(rendered)).toEqual(['Tab', '150 dpi', 'White']);
    expect(allText(rendered)).toContain('Export PNG');
  });

  it('saves with the chosen mode, resolution and background', () => {
    // Arrange
    const rendered = render('notationAndTab', false, 'png');

    // Act
    press(rendered, 'Score');
    press(rendered, '300 dpi');
    press(rendered, 'Transparent');
    press(rendered, SAVE_PNG);

    // Assert
    expect(rendered.onSavePng).toHaveBeenCalledWith('notation', { dpi: 300, isTransparent: true });
    expect(rendered.onSave).not.toHaveBeenCalled();
  });

  it('names the files it will write and their size in pixels', () => {
    // Arrange
    const rendered = render('tab', false, 'png');
    const pages = pdfPageCount(song, 0, 'tab', { fileName: 'Song.gp5' });

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

describe('ExportPanel with annotations', () => {
  const annotated = setBeatAnnotation(song, { trackIndex: 0, measureIndex: 3, beatIndex: 0, voiceIndex: 0 }, { text: 'Watch the bend\nsofter\nthe second time', placement: 'above' });
  const renderWith = (exportSong: Song, hidesAnnotations: boolean, format: ExportFormat = 'pdf') => {
    const onChange = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ExportPanel
          palette={PALETTE} song={exportSong} trackIndex={0} fileName="Song.gp" mode="notationAndTab" format={format} isSaving={false}
          onSave={jest.fn()} onSavePng={jest.fn()} onClose={jest.fn()} hidesAnnotations={hidesAnnotations} onChangeHidesAnnotations={onChange}
        />,
      );
    });
    return { rendered: { renderer, onSave: jest.fn(), onSavePng: jest.fn(), onClose: jest.fn(), onOpenStylesheet: jest.fn() }, onChange };
  };

  it('prints them by default and can leave them out, for PDF and PNG alike', () => {
    // Arrange
    const { rendered, onChange } = renderWith(annotated, false);
    const png = renderWith(annotated, true, 'png');

    // Act
    press(rendered, 'Leave out');

    // Assert
    expect(activeLabels(rendered)).toContain('Print');
    expect(onChange).toHaveBeenCalledWith(true);
    expect(activeLabels(png.rendered)).toContain('Leave out');
    expect(allText(rendered)).toContain('Annotations');
  });

  it('counts the pages without them when they are left out', () => {
    const shown = pdfPageCount(annotated, 0, 'notationAndTab', { fileName: 'Song.gp' });
    const left = pdfPageCount(annotated, 0, 'notationAndTab', { fileName: 'Song.gp', hidesAnnotations: true });
    expect(allText(renderWith(annotated, false).rendered)).toContain(shown === 1 ? '1 page' : `${shown} pages`);
    expect(allText(renderWith(annotated, true).rendered)).toContain(left === 1 ? '1 page' : `${left} pages`);
  });

  it('shows no choice for a song without annotations', () => {
    const { rendered } = renderWith(song, false);
    expect(rendered.renderer.root.findAllByType(BarButton).map((b) => b.props.label)).not.toContain('Leave out');
    expect(allText(rendered)).not.toContain('Annotations');
  });
});
