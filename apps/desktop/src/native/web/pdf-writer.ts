// The PDF export of the Windows build: the pages' DrawCommands written as vector PDF with pdf-lib, as GPPdfExport.m
// draws them with GPCommandPainter into a CoreGraphics PDF. Music text is Bravura (embedded); UI and fret-number text
// use Windows' own fonts (Segoe UI, Consolas), with Malgun Gothic and Segoe UI Symbol for characters they lack
// (Korean titles, ♩), read through the Rust side. In a browser the PDF standard fonts stand in.
import fontkit from '@pdf-lib/fontkit';
import { LineCapStyle, PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { PdfDocument, PdfPage } from '../../export/pdf-document';
import type { DrawCommand, DrawFont, TextCommand } from '../../score/draw';
import { musicFontBytes } from './fonts';
import { callBytes, isTauri } from './tauri';

/** A font usable for text: the embedded font and which characters it has. */
interface TextFont {
  readonly pdf: PDFFont;
  readonly has: (codePoint: number) => boolean;
}

/** The fonts of one document, by draw font and weight: the first that has a character draws it. */
interface FontSet {
  readonly music: TextFont;
  readonly chains: Readonly<Record<'ui' | 'uiBold' | 'mono' | 'monoBold', readonly TextFont[]>>;
}

/** Windows font files (C:\Windows\Fonts) for each face, the first found is used. */
const SYSTEM_FONTS = {
  ui: ['segoeui.ttf', 'arial.ttf'],
  uiBold: ['seguisb.ttf', 'segoeuib.ttf', 'arialbd.ttf'],
  mono: ['consola.ttf', 'cour.ttf'],
  monoBold: ['consolab.ttf', 'courbd.ttf'],
  korean: ['malgun.ttf'],
  koreanBold: ['malgunbd.ttf', 'malgun.ttf'],
  symbol: ['seguisym.ttf'],
} as const;

type SystemFace = keyof typeof SYSTEM_FONTS;

function color(hex: string): { color: ReturnType<typeof rgb>; opacity: number } {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  const channel = (at: number) => parseInt(digits.slice(at, at + 2), 16) / 255;
  return { color: rgb(channel(0), channel(2), channel(4)), opacity: digits.length === 8 ? channel(6) : 1 };
}

async function embedSystemFont(document: PDFDocument, face: SystemFace): Promise<TextFont | undefined> {
  try {
    const bytes = await callBytes('system_font', { candidates: [...SYSTEM_FONTS[face]] });
    const parsed = fontkit.create(bytes);
    const pdf = await document.embedFont(bytes, { subset: true });
    return { pdf, has: (codePoint) => parsed.hasGlyphForCodePoint(codePoint) };
  } catch {
    return undefined;
  }
}

/** A PDF standard font: Windows-1252 characters only. */
async function embedStandardFont(document: PDFDocument, name: StandardFonts): Promise<TextFont> {
  const pdf = await document.embedFont(name);
  return {
    pdf,
    has: (codePoint) => {
      try {
        pdf.encodeText(String.fromCodePoint(codePoint));
        return true;
      } catch {
        return false;
      }
    },
  };
}

async function loadFonts(document: PDFDocument): Promise<FontSet> {
  document.registerFontkit(fontkit);
  const musicBytes = await musicFontBytes();
  const musicParsed = fontkit.create(musicBytes);
  // Bravura is a CFF font: embedded whole (pdf-lib's subsetting is for TrueType outlines).
  const music: TextFont = { pdf: await document.embedFont(musicBytes, { subset: false }), has: (codePoint) => musicParsed.hasGlyphForCodePoint(codePoint) };
  const faces: SystemFace[] = ['ui', 'uiBold', 'mono', 'monoBold', 'korean', 'koreanBold', 'symbol'];
  const system = isTauri() ? await Promise.all(faces.map((face) => embedSystemFont(document, face))) : faces.map(() => undefined);
  const byFace = Object.fromEntries(faces.map((face, i) => [face, system[i]])) as Record<SystemFace, TextFont | undefined>;
  const standard = {
    ui: await embedStandardFont(document, StandardFonts.Helvetica),
    uiBold: await embedStandardFont(document, StandardFonts.HelveticaBold),
    mono: await embedStandardFont(document, StandardFonts.Courier),
    monoBold: await embedStandardFont(document, StandardFonts.CourierBold),
  };
  const chain = (...fonts: (TextFont | undefined)[]) => fonts.filter((font): font is TextFont => font !== undefined);
  return {
    music,
    chains: {
      ui: chain(byFace.ui, byFace.korean, byFace.symbol, standard.ui, music),
      uiBold: chain(byFace.uiBold, byFace.koreanBold, byFace.symbol, standard.uiBold, music),
      mono: chain(byFace.mono, byFace.ui, byFace.korean, byFace.symbol, standard.mono),
      monoBold: chain(byFace.monoBold, byFace.uiBold, byFace.koreanBold, byFace.symbol, standard.monoBold),
    },
  };
}

interface TextRun {
  readonly font: TextFont;
  readonly text: string;
}

/** The text cut into runs, each in the first font of the chain that has its characters (others dropped). */
export function textRuns(text: string, chain: readonly TextFont[]): TextRun[] {
  const runs: { font: TextFont; text: string }[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const font = chain.find((each) => each.has(codePoint));
    if (font === undefined) {
      continue;
    }
    const last = runs.at(-1);
    if (last !== undefined && last.font === font) {
      last.text += character;
    } else {
      runs.push({ font, text: character });
    }
  }
  return runs;
}

function chainFor(fonts: FontSet, font: DrawFont, bold: boolean): readonly TextFont[] {
  if (font === 'music') {
    return [fonts.music, ...fonts.chains.ui];
  }
  const key = font === 'mono' ? (bold ? 'monoBold' : 'mono') : bold ? 'uiBold' : 'ui';
  return fonts.chains[key];
}

function drawText(page: PDFPage, c: TextCommand, fonts: FontSet): void {
  const chain = chainFor(fonts, c.font, c.bold === true);
  const runs = textRuns(c.text, chain);
  const first = chain[0];
  if (runs.length === 0 || first === undefined) {
    return;
  }
  const width = runs.reduce((sum, run) => sum + run.font.pdf.widthOfTextAtSize(run.text, c.size), 0);
  let x = c.x - (c.align === 'center' ? width / 2 : c.align === 'right' ? width : 0);
  // Music text sits on its baseline; UI text is centred on y by its font's ascent and descent.
  const ascent = first.pdf.heightAtSize(c.size, { descender: false });
  const lineHeight = first.pdf.heightAtSize(c.size);
  const baseline = c.font === 'music' ? c.y : c.y - lineHeight / 2 + ascent;
  const { color: fill, opacity } = color(c.color);
  for (const run of runs) {
    page.drawText(run.text, { x, y: page.getHeight() - baseline, size: c.size, font: run.font.pdf, color: fill, opacity });
    x += run.font.pdf.widthOfTextAtSize(run.text, c.size);
  }
}

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return `M ${x + r} ${y} H ${x + width - r} Q ${x + width} ${y} ${x + width} ${y + r} V ${y + height - r} Q ${x + width} ${y + height} ${x + width - r} ${y + height} H ${x + r} Q ${x} ${y + height} ${x} ${y + height - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}

function drawCommand(page: PDFPage, command: DrawCommand, fonts: FontSet): void {
  const height = page.getHeight();
  // SVG paths are given in the page's top-left coordinates: pdf-lib flips them about (0, height).
  const origin = { x: 0, y: height };
  switch (command.kind) {
    case 'line': {
      const { color: stroke, opacity } = color(command.color);
      const dash = command.dash !== undefined && command.dash.length > 0 ? [...command.dash] : undefined;
      page.drawLine({ start: { x: command.x1, y: height - command.y1 }, end: { x: command.x2, y: height - command.y2 }, thickness: command.width, color: stroke, opacity, dashArray: dash });
      break;
    }
    case 'rect': {
      const { color: fill, opacity } = color(command.color);
      const radius = command.radius ?? 0;
      if (radius > 0) {
        page.drawSvgPath(roundedRectPath(command.x, command.y, command.width, command.height, radius), { ...origin, color: fill, opacity });
      } else {
        page.drawRectangle({ x: command.x, y: height - command.y - command.height, width: command.width, height: command.height, color: fill, opacity });
      }
      break;
    }
    case 'circle': {
      const { color: paint, opacity } = color(command.color);
      const at = { x: command.x, y: height - command.y, size: command.radius };
      if (command.strokeWidth !== undefined) {
        page.drawCircle({ ...at, borderColor: paint, borderWidth: command.strokeWidth, borderOpacity: opacity });
      } else {
        page.drawCircle({ ...at, color: paint, opacity });
      }
      break;
    }
    case 'curve': {
      const { color: stroke, opacity } = color(command.color);
      const path = `M ${command.x1} ${command.y1} Q ${command.cx} ${command.cy} ${command.x2} ${command.y2}`;
      page.drawSvgPath(path, { ...origin, borderColor: stroke, borderWidth: command.width, borderOpacity: opacity, borderLineCap: LineCapStyle.Round });
      break;
    }
    case 'polygon': {
      const { points } = command;
      if (points.length < 6) {
        break;
      }
      const { color: fill, opacity } = color(command.color);
      const pairs: string[] = [];
      for (let i = 0; i + 1 < points.length; i += 2) {
        pairs.push(`${i === 0 ? 'M' : 'L'} ${points[i] ?? 0} ${points[i + 1] ?? 0}`);
      }
      page.drawSvgPath(`${pairs.join(' ')} Z`, { ...origin, color: fill, opacity });
      break;
    }
    case 'text':
      drawText(page, command, fonts);
      break;
  }
}

function drawPage(document: PDFDocument, source: PdfPage, fonts: FontSet): void {
  const page = document.addPage([source.width, source.height]);
  for (const command of source.commands) {
    drawCommand(page, command, fonts);
  }
}

/** The document as PDF bytes. */
export async function writePdf(source: PdfDocument): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(source.title);
  // i18n-exempt: the app's name, in the PDF's metadata
  document.setCreator('GP Editor');
  document.setProducer('GP Editor'); // i18n-exempt: the app's name
  const fonts = await loadFonts(document);
  source.pages.forEach((page) => drawPage(document, page, fonts));
  return document.save();
}
