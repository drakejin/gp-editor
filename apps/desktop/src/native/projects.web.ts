// Windows twin of projects.ts: the project folders (Documents\GP Editor Projects) are kept by the Rust side
// (src-tauri/src/commands/projects.rs, which refuses paths outside a project, like GPProjects.m); the PDF work that
// PDFKit does on the Mac (page count, extracting pages) is done here with pdf-lib.
import { PDFDocument } from 'pdf-lib';
import { bytesToBase64 } from '../lib/base64';
import { t } from '../lib/i18n/i18n';
import { pickFilePath } from './web/files';
import { call, callBytes, fileNameOf, isTauri, NativeError } from './web/tauri';

export interface PdfChoice {
  readonly path: string;
  readonly name: string;
}

export interface CreatedProject {
  readonly path: string;
  readonly name: string;
  readonly sourceFile: string;
  readonly pageCount: number;
}

export interface ProjectEntry {
  readonly path: string;
  readonly name: string;
  readonly modified: number;
  readonly project: string | null;
}

/** Every page is one paid request: a PDF longer than this is refused (split it). */
const MAX_IMPORT_PAGES = 60;
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export async function choosePdf(): Promise<PdfChoice | null> {
  const path = await pickFilePath([{ name: 'PDF', extensions: ['pdf'] }], t('window.windows.importPdfTitle'));
  return path === null ? null : { path, name: fileNameOf(path) };
}

async function readablePdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    if (document.getPageCount() === 0) {
      throw new Error('empty');
    }
    return document;
  } catch {
    throw new NativeError(t('window.windows.badPdf'), 'bad_pdf');
  }
}

export async function createProject(pdfPath: string): Promise<CreatedProject> {
  const bytes = await callBytes('read_file', { path: pdfPath });
  if (bytes.length > MAX_IMPORT_BYTES) {
    throw new NativeError(t('window.windows.pdfTooLarge'), 'too_large');
  }
  const pageCount = (await readablePdf(bytes)).getPageCount();
  if (pageCount > MAX_IMPORT_PAGES) {
    throw new NativeError(
      t('window.windows.pdfTooManyPages', { count: pageCount, max: MAX_IMPORT_PAGES }),
      'too_many_pages',
    );
  }
  const created = await call<{ path: string; name: string; sourceFile: string }>('project_create', { pdfPath });
  return { ...created, pageCount };
}

/** Pages first…last (1-based, inclusive) of a PDF in the project, as a new PDF in base64. */
export async function pdfPages(projectPath: string, file: string, first: number, last: number): Promise<string> {
  const source = await readablePdf(await callBytes('project_read_bytes', { project: projectPath, file }));
  if (first < 1 || last < first || last > source.getPageCount()) {
    throw new NativeError(t('window.windows.badPdfPages'), 'bad_pages');
  }
  const extract = await PDFDocument.create();
  const indexes = Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i);
  const pages = await extract.copyPages(source, indexes);
  pages.forEach((page) => extract.addPage(page));
  return bytesToBase64(await extract.save());
}

export function writeProjectText(projectPath: string, file: string, text: string): Promise<string> {
  return call<string>('project_write', { project: projectPath, file, base64: bytesToBase64(new TextEncoder().encode(text)) });
}

export function writeProjectBase64(projectPath: string, file: string, base64: string): Promise<string> {
  return call<string>('project_write', { project: projectPath, file, base64 });
}

export function readProjectText(projectPath: string, file: string): Promise<string | null> {
  return call<string | null>('project_read_text', { project: projectPath, file });
}

export function listProjects(): Promise<readonly ProjectEntry[]> {
  return isTauri() ? call<ProjectEntry[]>('project_list') : Promise.resolve([]);
}

/** Shows the project folder in File Explorer. */
export function revealProject(projectPath: string): Promise<void> {
  return call('project_reveal', { project: projectPath });
}
