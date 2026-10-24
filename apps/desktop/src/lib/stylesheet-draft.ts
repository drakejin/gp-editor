import {
  type HeaderElement,
  type NotationStyle,
  PAGE_FORMATS,
  type PageMargins,
  type PageSetup,
  type Stylesheet,
  type SymbolLabel,
  type SystemsStyle,
  type TextElement,
  type TextStyle,
  pageSize,
} from '@gp-editor/core';

/** The Stylesheet dialog's tabs, as Guitar Pro 8 names them. */
export type StylesheetTab = 'page' | 'systems' | 'header' | 'texts' | 'notation';

export const STYLESHEET_TABS: readonly (readonly [StylesheetTab, string])[] = [
  ['page', 'Page & Score Format'],
  ['systems', 'Systems & Staves'],
  ['header', 'Header & Footer'],
  ['texts', 'Texts & Styles'],
  ['notation', 'Notation'],
];

export const TEXT_ELEMENT_NAMES: Readonly<Record<TextElement, string>> = {
  title: 'Title', subtitle: 'Subtitle', artist: 'Artist', album: 'Album', words: 'Words', music: 'Music', tabber: 'Tabber', copyright: 'Copyright',
  tempo: 'Tempo', trackName: 'Track names', chordName: 'Chords', lyrics: 'Lyrics', barNumber: 'Bar numbers', freeText: 'Free text',
};

export const HEADER_ELEMENT_NAMES: Readonly<Record<HeaderElement, string>> = {
  title: 'Title', subtitle: 'Subtitle', artist: 'Artist', album: 'Album', words: 'Words', music: 'Music', tabber: 'Tabber', copyright: 'Copyright',
};

/** Guitar Pro 8's names of the labels its Texts & Styles tab renames. */
export const SYMBOL_LABEL_NAMES: Readonly<Record<SymbolLabel, string>> = {
  letRing: 'Let Ring', palmMute: 'Palm Mute', hammerOn: 'Hammer-On', pullOff: 'Pull-Off', slide: 'Slide', tapping: 'Tapping', slap: 'Slap', pop: 'Pop',
  rasgueado: 'Rasgueado', whammyBar: 'Whammy Bar',
};

/** Families every Mac has, offered before the installed fonts are known (and in the tests). */
export const COMMON_FONT_FAMILIES: readonly string[] = [
  'Helvetica Neue', 'Avenir Next', 'Georgia', 'Times New Roman', 'Palatino', 'Baskerville', 'Futura', 'Gill Sans', 'Optima', 'Menlo', 'Courier New', 'American Typewriter',
  'Marker Felt', 'Chalkboard SE', 'Apple SD Gothic Neo',
];

const MM_PER_POINT = 25.4 / 72;

/** `value` moved by `delta` steps of `step`, within `range`, rounded to `decimals`. */
export function stepNumber(value: number, delta: number, step: number, range: { readonly min: number; readonly max: number }, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(Math.min(range.max, Math.max(range.min, value + delta * step)) * factor) / factor;
}

/** "125 %". */
export function percentText(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/** A length in millimetres without trailing zeros: "12.7 mm", "10 mm". */
export function millimetresText(value: number): string {
  return `${Math.round(value * 10) / 10} mm`;
}

/** "A4 · portrait · 210 × 297 mm": the page the PDF, PNG and Print use. */
export function pageSummary(page: PageSetup): string {
  const { width, height } = pageSize(page);
  const name = PAGE_FORMATS.find((format) => format.id === page.format)?.name ?? 'Custom';
  return `${name} · ${page.orientation} · ${Math.round(width * MM_PER_POINT)} × ${Math.round(height * MM_PER_POINT)} mm`;
}

export function withPage(sheet: Stylesheet, patch: Partial<PageSetup>): Stylesheet {
  return { ...sheet, page: { ...sheet.page, ...patch } };
}

export function withMargin(sheet: Stylesheet, side: keyof PageMargins, value: number): Stylesheet {
  return withPage(sheet, { margins: { ...sheet.page.margins, [side]: value } });
}

export function withSystems(sheet: Stylesheet, patch: Partial<SystemsStyle>): Stylesheet {
  return { ...sheet, systems: { ...sheet.systems, ...patch } };
}

export function withText(sheet: Stylesheet, element: TextElement, patch: Partial<TextStyle>): Stylesheet {
  return { ...sheet, texts: { ...sheet.texts, [element]: { ...sheet.texts[element], ...patch } } };
}

export function withHeaderShown(sheet: Stylesheet, element: HeaderElement, isShown: boolean): Stylesheet {
  return { ...sheet, header: { ...sheet.header, shown: { ...sheet.header.shown, [element]: isShown } } };
}

export function withNotation(sheet: Stylesheet, patch: Partial<NotationStyle>): Stylesheet {
  return { ...sheet, notation: { ...sheet.notation, ...patch } };
}

export function withLabel(sheet: Stylesheet, label: SymbolLabel, text: string): Stylesheet {
  return withNotation(sheet, { labels: { ...sheet.notation.labels, [label]: text } });
}

/** A text style in words: "System font, 11 pt, bold". */
export function textStyleText(style: TextStyle): string {
  return [style.family === '' ? 'System font' : style.family, `${style.size} pt`, ...(style.isBold ? ['bold'] : []), ...(style.isItalic ? ['italic'] : [])].join(', ');
}

/** The families whose name holds every word typed (any case), the chosen one first, at most `limit`. */
export function matchingFamilies(families: readonly string[], filter: string, chosen: string, limit: number): string[] {
  const words = filter.toLowerCase().split(/\s+/).filter((word) => word !== '');
  const matches = families.filter((family) => words.every((word) => family.toLowerCase().includes(word)));
  const first = chosen !== '' && matches.includes(chosen) ? [chosen] : [];
  return [...first, ...matches.filter((family) => family !== chosen)].slice(0, limit);
}
