// i18n-exempt-file: font family names and CSS font lists
import bravuraUrl from '../../../macos/GPEditor-macOS/Fonts/Bravura.otf?url';
import type { DrawFont } from '../../score/draw';

/**
 * The fonts the score is drawn with in the Windows build. Bravura (SMuFL, OFL) is the macOS app's bundled music font,
 * loaded from the same file; the UI and monospaced faces are Windows' own (Segoe UI, Consolas), as the Mac uses its
 * system font and Menlo. "Menlo" is aliased to Consolas so the app's MONO_FONT styles work unchanged.
 */
export const MUSIC_FONT = 'Bravura';
const UI_FAMILY = "'Segoe UI', system-ui, sans-serif";
const MONO_FAMILY = "Consolas, 'Cascadia Mono', 'Courier New', monospace";

/** The CSS font for a draw command's text. */
export function cssFont(font: DrawFont, size: number, bold: boolean): string {
  const family = font === 'music' ? `${MUSIC_FONT}, serif` : font === 'mono' ? MONO_FAMILY : UI_FAMILY;
  // Semibold, as GPCommandPainter's NSFontWeightSemibold (Bravura has one weight).
  const weight = bold && font !== 'music' ? 600 : 400;
  return `${weight} ${size}px ${family}`;
}

/** The music font's address, absolute (a print document in an iframe loads it too). */
export function musicFontUrl(): string {
  return new URL(bravuraUrl, document.baseURI).href;
}

let loaded: Promise<void> | undefined;

/** Registers the fonts once; resolves when Bravura can draw (canvases redraw then). */
export function loadFonts(): Promise<void> {
  if (loaded === undefined) {
    const music = new FontFace(MUSIC_FONT, `url(${bravuraUrl})`);
    const menlo = new FontFace('Menlo', "local('Consolas'), local('Cascadia Mono'), local('Courier New')");
    document.fonts.add(music);
    document.fonts.add(menlo);
    loaded = Promise.allSettled([music.load(), menlo.load()]).then(() => undefined);
  }
  return loaded;
}

/** The bytes of the music font (the PDF export embeds it). */
export async function musicFontBytes(): Promise<Uint8Array> {
  const response = await fetch(bravuraUrl);
  return new Uint8Array(await response.arrayBuffer());
}
