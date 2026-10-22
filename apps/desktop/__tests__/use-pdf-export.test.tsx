import ReactTestRenderer from 'react-test-renderer';
import type { PdfDocument } from '../src/export/pdf-document';
import { type PdfExport, usePdfExport } from '../src/hooks/use-pdf-export';
import type { OpenDocument } from '../src/state/editor';
import { beat, makeSong, note } from '../test-support/songs';

const mockExportRequests: { handler?: () => void } = {};
const mockSavePdf = jest.fn<Promise<{ name: string; path: string } | null>, [PdfDocument, string]>();

jest.mock('../src/native/gp-files', () => ({
  subscribeExportRequests: (handler: () => void) => {
    mockExportRequests.handler = handler;
    return () => {
      mockExportRequests.handler = undefined;
    };
  },
}));

jest.mock('../src/native/pdf-export', () => ({
  savePdf: (document: PdfDocument, suggestedName: string) => mockSavePdf(document, suggestedName),
}));

const DOCUMENT: OpenDocument = { fileName: 'Song.gp5', path: '/Song.gp5', song: makeSong([[beat(960, [note(1, 3)])]]) };

function renderHook(document: OpenDocument | undefined): { current: () => PdfExport; dispatch: jest.Mock } {
  const dispatch = jest.fn();
  let latest: PdfExport | undefined;
  function Probe() {
    latest = usePdfExport(document, 0, dispatch);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return {
    current: () => {
      if (latest === undefined) {
        throw new Error('the hook did not run');
      }
      return latest;
    },
    dispatch,
  };
}

function pressCommandP(): void {
  ReactTestRenderer.act(() => mockExportRequests.handler?.());
}

async function settle(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockSavePdf.mockReset();
  mockExportRequests.handler = undefined;
});

describe('usePdfExport', () => {
  it('opens the export panel on ⌘P, as the Export… button does', () => {
    // Arrange
    const viaShortcut = renderHook(DOCUMENT);

    // Act
    pressCommandP();
    const viaButton = renderHook(DOCUMENT);
    ReactTestRenderer.act(() => viaButton.current().open());

    // Assert
    expect(viaShortcut.current().isOpen).toBe(true);
    expect(viaButton.current().isOpen).toBe(true);
  });

  it('ignores ⌘P without a document, like the disabled Export… button', () => {
    const hook = renderHook(undefined);
    pressCommandP();
    expect(hook.current().isOpen).toBe(false);
  });

  it('saves the PDF of the chosen mode and paper under the file name, then closes the panel', async () => {
    // Arrange
    mockSavePdf.mockResolvedValueOnce({ name: 'Song (Tab).pdf', path: '/Song (Tab).pdf' });
    const hook = renderHook(DOCUMENT);
    pressCommandP();

    // Act
    ReactTestRenderer.act(() => hook.current().save('tab', 'letter'));
    expect(hook.current().isSaving).toBe(true);
    await settle();

    // Assert
    const [pdf, name] = mockSavePdf.mock.calls[0] ?? [];
    expect(name).toBe('Song (Tab).pdf');
    expect(pdf?.title).toBe('Test');
    expect(pdf?.pages[0]).toMatchObject({ width: 612, height: 792 });
    expect(hook.current()).toMatchObject({ isOpen: false, isSaving: false });
  });

  it('ignores Save PDF… while a save is under way', async () => {
    // Arrange
    let finish: (saved: null) => void = () => undefined;
    mockSavePdf.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const hook = renderHook(DOCUMENT);
    pressCommandP();

    // Act
    ReactTestRenderer.act(() => {
      hook.current().save('tab', 'a4');
      hook.current().save('tab', 'a4');
    });
    ReactTestRenderer.act(() => hook.current().save('tab', 'a4'));
    await ReactTestRenderer.act(async () => {
      finish(null);
      await Promise.resolve();
    });

    // Assert
    expect(mockSavePdf).toHaveBeenCalledTimes(1);
    expect(hook.current().isSaving).toBe(false);
  });

  it('keeps the panel open when the save panel is cancelled', async () => {
    mockSavePdf.mockResolvedValueOnce(null);
    const hook = renderHook(DOCUMENT);
    pressCommandP();
    ReactTestRenderer.act(() => hook.current().save('notationAndTab', 'a4'));
    await settle();
    expect(hook.current()).toMatchObject({ isOpen: true, isSaving: false });
  });

  it('reports a failed export to the error banner', async () => {
    // Arrange
    mockSavePdf.mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(DOCUMENT);
    pressCommandP();

    // Act
    ReactTestRenderer.act(() => hook.current().save('notation', 'a4'));
    await settle();

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', message: 'disk full' });
    expect(hook.current().isSaving).toBe(false);
  });
});
