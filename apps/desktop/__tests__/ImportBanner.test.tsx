import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { BarButton } from '../src/components/BarButton';
import { ImportBanner } from '../src/components/ImportBanner';
import type { PdfImport } from '../src/hooks/use-pdf-import';
import { type ImportProject, newImportProject } from '../src/pdf-import/project-file';
import { PALETTE } from '../test-support/score-helpers';

const PROJECT: ImportProject = {
  ...newImportProject({ path: '/p/Etude', name: 'Etude', sourceFile: 'Etude.pdf', pageCount: 2 }, 'claude-opus-5-5', new Date(0)),
  status: 'done',
  pagesDone: [1, 2],
  songFile: 'Etude.gp5',
};

function pdfImport(overrides: Partial<PdfImport>): PdfImport {
  const noop = () => undefined;
  return {
    current: { path: '/p/Etude', project: PROJECT },
    isRunning: false,
    isCancelling: false,
    projects: [],
    hasKey: true,
    model: 'claude-opus-5-5',
    start: noop,
    importPath: noop,
    resume: noop,
    cancel: noop,
    reveal: noop,
    saveKey: async () => undefined,
    removeKey: noop,
    chooseModel: noop,
    dismiss: noop,
    ...overrides,
  };
}

function buttonLabels(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(BarButton).map((button) => button.props.label as string);
}

describe('ImportBanner', () => {
  it('offers the import settings (key and model) after an import that went well', () => {
    // Arrange
    const onOpenSettings = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ImportBanner palette={PALETTE} pdfImport={pdfImport({})} onOpenSettings={onOpenSettings} />);
    });

    // Act
    ReactTestRenderer.act(() => {
      renderer.root.findAllByType(BarButton).find((button) => button.props.label === 'Import settings…')?.props.onPress();
    });

    // Assert
    expect(buttonLabels(renderer)).toContain('Import settings…');
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('hides the settings while an import runs', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ImportBanner palette={PALETTE} pdfImport={pdfImport({ isRunning: true })} onOpenSettings={() => undefined} />,
      );
    });
    expect(buttonLabels(renderer)).toEqual(['Cancel', 'Show in Finder']);
  });

  it('says at once that it is cancelling, and that the page being transcribed still finishes', () => {
    // Arrange
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    const running = { path: '/p/Etude', project: { ...PROJECT, status: 'transcribing' as const, pagesDone: [] } };

    // Act
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ImportBanner palette={PALETTE} pdfImport={pdfImport({ isRunning: true, isCancelling: true, current: running })} onOpenSettings={() => undefined} />,
      );
    });

    // Assert
    const line = renderer.root.findAllByType(Text).map((text) => text.props.children).join(' ');
    expect(line).toContain('Cancelling “Etude” — the page being transcribed still finishes');
    expect(buttonLabels(renderer)).toEqual(['Show in Finder']);
  });
});
