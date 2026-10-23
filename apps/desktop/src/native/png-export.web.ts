// Windows twin of png-export.ts: each page drawn on a canvas by web/painter.ts at the chosen resolution and saved as
// a PNG — a save dialog for one page, a folder for several (asking before replacing files), as GPPngExport.m does.
import { confirm } from '@tauri-apps/plugin-dialog';
import type { PdfDocument, PdfPage } from '../export/pdf-document';
import { type PngOptions, pngRender } from '../export/png-export';
import { pickFolder, pickSavePath, writePath } from './web/files';
import { loadFonts } from './web/fonts';
import { paintCommands } from './web/painter';
import { call, fileNameOf, folderOf, isTauri } from './web/tauri';

export interface SavedPngs {
  readonly folder: string;
  readonly folderName: string;
  readonly names: readonly string[];
}

const MAX_SCALE = 300 / 72;

async function pagePng(page: PdfPage, scale: number, eraseColor: string): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.width * scale);
  canvas.height = Math.round(page.height * scale);
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Could not draw the page');
  }
  context.scale(scale, scale);
  paintCommands(context, page.commands, { eraseColor });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob === null) {
    throw new Error('Could not draw the page');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function joinPath(folder: string, name: string): string {
  return folder.endsWith('\\') || folder.endsWith('/') ? `${folder}${name}` : `${folder}\\${name}`;
}

/** Where the images go: one path per page; null when cancelled (or when the user keeps the files already there). */
async function destinations(fileNames: readonly string[]): Promise<string[] | null> {
  if (fileNames.length === 1) {
    const path = await pickSavePath(fileNames[0] ?? 'Score.png', [{ name: 'PNG image', extensions: ['png'] }], 'Export PNG');
    return path === null ? null : [/\.png$/i.test(path) ? path : `${path}.png`];
  }
  if (!isTauri()) {
    return [...fileNames];
  }
  const folder = await pickFolder(`Choose a folder for the ${fileNames.length} PNG images (${fileNames[0] ?? ''} … ${fileNames.at(-1) ?? ''})`);
  if (folder === null) {
    return null;
  }
  const paths = fileNames.map((name) => joinPath(folder, name));
  const exists = await call<boolean[]>('files_exist', { paths });
  const existing = paths.filter((_, i) => exists[i] === true);
  if (existing.length > 0) {
    const replace = await confirm(`${existing.length} of the images already exist in “${fileNameOf(folder)}”. Replace them?`, { title: 'Export PNG', kind: 'warning' });
    if (!replace) {
      return null;
    }
  }
  return paths;
}

export async function savePngs(document: PdfDocument, fileNames: readonly string[], options: PngOptions): Promise<SavedPngs | null> {
  const { scale, eraseColor } = pngRender(options);
  if (document.pages.length === 0 || fileNames.length !== document.pages.length || !(scale > 0 && scale <= MAX_SCALE)) {
    throw new Error('Nothing to export');
  }
  const paths = await destinations(fileNames);
  if (paths === null) {
    return null;
  }
  await loadFonts();
  for (const [index, page] of document.pages.entries()) {
    await writePath(paths[index] ?? '', await pagePng(page, scale, eraseColor), 'image/png');
  }
  const folder = folderOf(paths[0] ?? '');
  return { folder, folderName: fileNameOf(folder), names: paths.map(fileNameOf) };
}
