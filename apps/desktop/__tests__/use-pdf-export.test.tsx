import ReactTestRenderer from 'react-test-renderer';
import { DEFAULT_STYLESHEET, setStylesheet } from '@gp-editor/core';
import type { PdfDocument } from '../src/export/pdf-document';
import type { PngOptions } from '../src/export/png-export';
import { type PdfExport, usePdfExport } from '../src/hooks/use-pdf-export';
import type { SavedPngs } from '../src/native/png-export';
import type { StaffSpec } from '../src/score/score-layout';
import type { OpenDocument } from '../src/state/editor';
import { textValues } from '../test-support/score-helpers';
import { beat, makeSong, note, withTrack } from '../test-support/songs';

const mockExportRequests: { handler?: () => void } = {};
const mockPrintRequests: { handler?: () => void } = {};
const mockExportPngRequests: { handler?: () => void } = {};
const mockSavePngs = jest.fn<Promise<SavedPngs | null>, [PdfDocument, readonly string[], PngOptions]>();
const mockSavePdf = jest.fn<Promise<{ name: string; path: string } | null>, [PdfDocument, string]>();
const mockPrintPdf = jest.fn<Promise<boolean>, [PdfDocument]>();
const mockWritePdf = jest.fn<Promise<{ name: string; path: string }>, [PdfDocument, string]>();

jest.mock('../src/native/gp-files', () => ({
  subscribeExportRequests: (handler: () => void) => {
    mockExportRequests.handler = handler;
    return () => {
      mockExportRequests.handler = undefined;
    };
  },
  subscribePrintRequests: (handler: () => void) => {
    mockPrintRequests.handler = handler;
    return () => {
      mockPrintRequests.handler = undefined;
    };
  },
  subscribeExportPngRequests: (handler: () => void) => {
    mockExportPngRequests.handler = handler;
    return () => {
      mockExportPngRequests.handler = undefined;
    };
  },
}));

jest.mock('../src/native/png-export', () => ({
  savePngs: (document: PdfDocument, fileNames: readonly string[], options: PngOptions) => mockSavePngs(document, fileNames, options),
}));

jest.mock('../src/native/pdf-export', () => ({
  savePdf: (document: PdfDocument, suggestedName: string) => mockSavePdf(document, suggestedName),
  printPdf: (document: PdfDocument) => mockPrintPdf(document),
  writePdf: (document: PdfDocument, path: string) => mockWritePdf(document, path),
}));

const DOCUMENT: OpenDocument = { fileName: 'Song.gp5', path: '/Song.gp5', song: makeSong([[beat(960, [note(1, 3)])]]) };
/** DOCUMENT with a stylesheet printing on US Letter. */
const ON_LETTER: OpenDocument = { ...DOCUMENT, song: setStylesheet(DOCUMENT.song, { ...DEFAULT_STYLESHEET, page: { ...DEFAULT_STYLESHEET.page, format: 'letter' } }) };

function renderHook(document: OpenDocument | undefined, staves?: readonly StaffSpec[]): { current: () => PdfExport; dispatch: jest.Mock } {
  const dispatch = jest.fn();
  let latest: PdfExport | undefined;
  function Probe() {
    latest = usePdfExport(document, 0, 'tab', dispatch, undefined, staves);
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

function chooseExportPdf(): void {
  ReactTestRenderer.act(() => mockExportRequests.handler?.());
}

async function settle(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockSavePdf.mockReset();
  mockPrintPdf.mockReset();
  mockSavePngs.mockReset();
  mockExportRequests.handler = undefined;
  mockPrintRequests.handler = undefined;
  mockExportPngRequests.handler = undefined;
});

describe('usePdfExport printing', () => {
  it('prints the shown track in the view’s mode on File ▸ Print… (⌘P)', async () => {
    // Arrange
    mockPrintPdf.mockResolvedValue(true);
    renderHook(DOCUMENT);

    // Act
    ReactTestRenderer.act(() => mockPrintRequests.handler?.());
    await settle();

    // Assert
    expect(mockPrintPdf).toHaveBeenCalledTimes(1);
    expect(mockPrintPdf.mock.calls[0]?.[0].title).toBe('Test');
  });

  it('does nothing without a document, and reports a failure', async () => {
    // Arrange
    renderHook(undefined);
    ReactTestRenderer.act(() => mockPrintRequests.handler?.());
    mockPrintPdf.mockRejectedValue(new Error('No printer'));
    const hook = renderHook(DOCUMENT);

    // Act
    ReactTestRenderer.act(() => hook.current().print());
    await settle();

    // Assert
    expect(mockPrintPdf).toHaveBeenCalledTimes(1);
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', message: 'No printer' });
  });
});

describe('usePdfExport', () => {
  it('opens the export panel on File ▸ Export PDF…, as the Export button does', () => {
    // Arrange
    const viaShortcut = renderHook(DOCUMENT);

    // Act
    chooseExportPdf();
    const viaButton = renderHook(DOCUMENT);
    ReactTestRenderer.act(() => viaButton.current().open());

    // Assert
    expect(viaShortcut.current().isOpen).toBe(true);
    expect(viaButton.current().isOpen).toBe(true);
  });

  it('ignores ⌘P without a document, like the disabled Export… button', () => {
    const hook = renderHook(undefined);
    chooseExportPdf();
    expect(hook.current().isOpen).toBe(false);
  });

  it('saves the PDF of the chosen mode on the stylesheet’s page under the file name, then closes the panel', async () => {
    // Arrange
    mockSavePdf.mockResolvedValueOnce({ name: 'Song (Tab).pdf', path: '/Song (Tab).pdf' });
    const hook = renderHook(ON_LETTER);
    chooseExportPdf();

    // Act
    ReactTestRenderer.act(() => hook.current().save('tab'));
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
    chooseExportPdf();

    // Act
    ReactTestRenderer.act(() => {
      hook.current().save('tab');
      hook.current().save('tab');
    });
    ReactTestRenderer.act(() => hook.current().save('tab'));
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
    chooseExportPdf();
    ReactTestRenderer.act(() => hook.current().save('notationAndTab'));
    await settle();
    expect(hook.current()).toMatchObject({ isOpen: true, isSaving: false });
  });

  it('reports a failed export to the error banner', async () => {
    // Arrange
    mockSavePdf.mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(DOCUMENT);
    chooseExportPdf();

    // Act
    ReactTestRenderer.act(() => hook.current().save('notation'));
    await settle();

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', message: 'disk full' });
    expect(hook.current().isSaving).toBe(false);
  });
});

describe('usePdfExport in the multitrack view', () => {
  const duet: OpenDocument = { ...DOCUMENT, song: withTrack(DOCUMENT.song, [[beat(960, [note(2, 5)])]], { name: 'Bass' }) };
  const staves: readonly StaffSpec[] = [{ trackIndex: 0, mode: 'tab' }, { trackIndex: 1, mode: 'notation' }];

  it('saves and prints the shown tracks, named after the multitrack view', async () => {
    // Arrange
    mockSavePdf.mockResolvedValueOnce({ name: 'Song (Multitrack).pdf', path: '/Song (Multitrack).pdf' });
    mockPrintPdf.mockResolvedValue(true);
    const hook = renderHook(duet, staves);
    chooseExportPdf();

    // Act
    ReactTestRenderer.act(() => hook.current().save('asShown'));
    await settle();
    ReactTestRenderer.act(() => mockPrintRequests.handler?.());
    await settle();

    // Assert
    const [pdf, name] = mockSavePdf.mock.calls[0] ?? [];
    expect(name).toBe('Song (Multitrack).pdf');
    expect(textValues(pdf?.pages[0]?.commands ?? [])).toContain('Bass');
    expect(textValues(mockPrintPdf.mock.calls[0]?.[0].pages[0]?.commands ?? [])).toContain('Bass');
  });
});

describe('usePdfExport PNG images', () => {
  const PNG: PngOptions = { dpi: 300, isTransparent: true };

  function chooseExportPng(): void {
    ReactTestRenderer.act(() => mockExportPngRequests.handler?.());
  }

  it('opens the panel for PNG images on File ▸ Export PNG…, and for a PDF on File ▸ Export PDF…', () => {
    // Arrange
    const hook = renderHook(DOCUMENT);

    // Act
    chooseExportPng();
    const afterPng = hook.current();
    ReactTestRenderer.act(() => hook.current().close());
    chooseExportPdf();

    // Assert
    expect(afterPng).toMatchObject({ isOpen: true, format: 'png' });
    expect(hook.current()).toMatchObject({ isOpen: true, format: 'pdf' });
  });

  it('ignores File ▸ Export PNG… without a document', () => {
    const hook = renderHook(undefined);
    chooseExportPng();
    expect(hook.current().isOpen).toBe(false);
  });

  it('saves one image per page of the chosen mode on the stylesheet’s page, then closes the panel and says where they went', async () => {
    // Arrange
    mockSavePngs.mockResolvedValueOnce({ folder: '/Exports', folderName: 'Exports', names: ['Song (Tab).png'] });
    const hook = renderHook(ON_LETTER);
    chooseExportPng();

    // Act
    ReactTestRenderer.act(() => hook.current().savePng('tab', PNG));
    expect(hook.current().isSaving).toBe(true);
    await settle();

    // Assert
    const [pages, names, options] = mockSavePngs.mock.calls[0] ?? [];
    expect(pages?.pages).toHaveLength(1);
    expect(pages?.pages[0]).toMatchObject({ width: 612, height: 792 });
    expect(names).toEqual(['Song (Tab).png']);
    expect(options).toEqual(PNG);
    expect(hook.current()).toMatchObject({ isOpen: false, isSaving: false });
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'showHint', hint: 'Saved Song (Tab).png in “Exports”.' });
  });

  it('keeps the panel open when the save panel is cancelled', async () => {
    mockSavePngs.mockResolvedValueOnce(null);
    const hook = renderHook(DOCUMENT);
    chooseExportPng();
    ReactTestRenderer.act(() => hook.current().savePng('notation', PNG));
    await settle();
    expect(hook.current()).toMatchObject({ isOpen: true, isSaving: false });
    expect(hook.dispatch).not.toHaveBeenCalled();
  });

  it('reports a failed PNG export to the error banner', async () => {
    // Arrange
    mockSavePngs.mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(DOCUMENT);
    chooseExportPng();

    // Act
    ReactTestRenderer.act(() => hook.current().savePng('notation', PNG));
    await settle();

    // Assert
    expect(hook.dispatch).toHaveBeenCalledWith({ type: 'exportFailed', message: 'disk full', what: 'the PNG images' });
  });

  it('ignores Save PNG… while a PDF is being saved', async () => {
    // Arrange
    let finish: (saved: null) => void = () => undefined;
    mockSavePdf.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const hook = renderHook(DOCUMENT);
    chooseExportPdf();

    // Act
    ReactTestRenderer.act(() => {
      hook.current().save('tab');
      hook.current().savePng('tab', PNG);
    });
    await ReactTestRenderer.act(async () => {
      finish(null);
      await Promise.resolve();
    });

    // Assert
    expect(mockSavePngs).not.toHaveBeenCalled();
  });
});

describe('usePdfExport.saveTo (the MCP server’s export_file)', () => {
  it('writes the score as shown at the path given, without the panel', async () => {
    // Arrange
    mockWritePdf.mockResolvedValueOnce({ name: 'Song.pdf', path: '/out/Song.pdf' });
    const hook = renderHook(DOCUMENT);

    // Act
    const saved = await hook.current().saveTo('/out/Song.pdf');

    // Assert
    expect(saved).toEqual({ name: 'Song.pdf', path: '/out/Song.pdf' });
    expect(mockSavePdf).not.toHaveBeenCalled();
    const [document, path] = mockWritePdf.mock.calls.at(-1) ?? [];
    expect(path).toBe('/out/Song.pdf');
    expect(document?.pages.length).toBeGreaterThan(0);
  });

  it('rejects without a document', async () => {
    await expect(renderHook(undefined).current().saveTo('/out/a.pdf')).rejects.toThrow('No document is open');
  });
});
