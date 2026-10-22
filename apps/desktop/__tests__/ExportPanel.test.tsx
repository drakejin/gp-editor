import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import type { Song } from '@gp-editor/core';
import { BarButton } from '../src/components/BarButton';
import { ExportPanel } from '../src/components/ExportPanel';
import { pdfPageCount } from '../src/export/pdf-document';
import type { ScoreMode } from '../src/score/geometry';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const SAVE = 'Save PDF…';

interface Rendered {
  readonly renderer: ReactTestRenderer.ReactTestRenderer;
  readonly onSave: jest.Mock;
  readonly onClose: jest.Mock;
}

const song: Song = makeSong(Array.from({ length: 40 }, (_, i) => [beat(header(i + 1).start, [note(1, i % 5)])]));

function render(mode: ScoreMode = 'notationAndTab', isSaving = false): Rendered {
  const onSave = jest.fn();
  const onClose = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <ExportPanel palette={PALETTE} song={song} trackIndex={0} fileName="Song.gp5" mode={mode} isSaving={isSaving} onSave={onSave} onClose={onClose} />,
    );
  });
  return { renderer, onSave, onClose };
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
