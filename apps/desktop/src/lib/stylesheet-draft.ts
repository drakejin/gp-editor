import {
  type HeaderElement,
  type NotationStyle,
  PAGE_FORMATS,
  STYLESHEET_LIMITS,
  type PageFormatId,
  type PageMargins,
  type PageSetup,
  type Stylesheet,
  type SymbolLabel,
  type SystemsStyle,
  type TextElement,
  type TextStyle,
  pageSize,
} from '@gp-editor/core';
import { type MessageKey, t } from './i18n/i18n';

/** The Stylesheet dialog's tabs, in Guitar Pro 8's order (and by its names, `stylesheetTabName`). */
export type StylesheetTab = 'page' | 'systems' | 'header' | 'texts' | 'notation';

export const STYLESHEET_TABS: readonly StylesheetTab[] = ['page', 'systems', 'header', 'texts', 'notation'];

const TAB_KEYS: Readonly<Record<StylesheetTab, MessageKey>> = {
  page: 'stylesheet.tab.page', systems: 'stylesheet.tab.systems', header: 'stylesheet.tab.header', texts: 'stylesheet.tab.texts', notation: 'stylesheet.tab.notation',
};

const TEXT_ELEMENT_KEYS: Readonly<Record<TextElement, MessageKey>> = {
  title: 'stylesheet.text.title', subtitle: 'stylesheet.text.subtitle', artist: 'stylesheet.text.artist', album: 'stylesheet.text.album', words: 'stylesheet.text.words',
  music: 'stylesheet.text.music', tabber: 'stylesheet.text.tabber', copyright: 'stylesheet.text.copyright', tempo: 'stylesheet.text.tempo', trackName: 'stylesheet.text.trackName',
  chordName: 'stylesheet.text.chordName', lyrics: 'stylesheet.text.lyrics', barNumber: 'stylesheet.text.barNumber', freeText: 'stylesheet.text.freeText',
};

/** Guitar Pro 8's names of the labels its Texts & Styles tab renames. */
const SYMBOL_LABEL_KEYS: Readonly<Record<SymbolLabel, MessageKey>> = {
  letRing: 'stylesheet.label.letRing', palmMute: 'stylesheet.label.palmMute', hammerOn: 'stylesheet.label.hammerOn', pullOff: 'stylesheet.label.pullOff', slide: 'stylesheet.label.slide',
  tapping: 'stylesheet.label.tapping', slap: 'stylesheet.label.slap', pop: 'stylesheet.label.pop', rasgueado: 'stylesheet.label.rasgueado', whammyBar: 'stylesheet.label.whammyBar',
};

/** A tab's name in the shown language. */
export function stylesheetTabName(tab: StylesheetTab): string {
  return t(TAB_KEYS[tab]);
}

/** A text of the score (Texts & Styles) or of the header (Header & Footer: the song information) by its name. */
export function textElementName(element: TextElement | HeaderElement): string {
  return t(TEXT_ELEMENT_KEYS[element]);
}

export function symbolLabelName(label: SymbolLabel): string {
  return t(SYMBOL_LABEL_KEYS[label]);
}

/** Families every Mac has, offered before the installed fonts are known (and in the tests). */
export const COMMON_FONT_FAMILIES: readonly string[] = [
  // i18n-exempt: font family names
  'Helvetica Neue', 'Avenir Next', 'Georgia', 'Times New Roman', 'Palatino', 'Baskerville', 'Futura', 'Gill Sans', 'Optima', 'Menlo', 'Courier New', 'American Typewriter',
  // i18n-exempt: font family names
  'Marker Felt', 'Chalkboard SE', 'Apple SD Gothic Neo',
];

const MM_PER_POINT = 25.4 / 72;

/** `value` moved by `delta` steps of `step`, within `range`, rounded to `decimals`. */
export function stepNumber(value: number, delta: number, step: number, range: { readonly min: number; readonly max: number }, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(Math.min(range.max, Math.max(range.min, value + delta * step)) * factor) / factor;
}

/** The steppers' steps: the scale by 5 %, a spacing by 2 pt. */
export const STYLESHEET_STEPS = { scale: 0.05, spacing: 2 } as const;

/** "+12 pt" of room added to the app's own, "−8 pt" taken from it (between systems). */
export function spacingText(value: number): string {
  return value < 0 ? `−${-value} pt` : `+${value} pt`;
}

/** "125 %". */
export function percentText(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/** A length in millimetres without trailing zeros: "12.7 mm", "10 mm". */
export function millimetresText(value: number): string {
  return `${Math.round(value * 10) / 10} mm`;
}

/** A page format's name: the paper's own ("A4", "US Letter"), or Custom in the shown language. */
export function pageFormatName(format: PageFormatId): string {
  return PAGE_FORMATS.find((each) => each.id === format)?.name ?? t('stylesheet.page.custom');
}

/** "A4 · portrait · 210 × 297 mm": the page the PDF, PNG and Print use. */
export function pageSummary(page: PageSetup): string {
  const { width, height } = pageSize(page);
  const params = { format: pageFormatName(page.format), width: Math.round(width * MM_PER_POINT), height: Math.round(height * MM_PER_POINT) };
  return t(page.orientation === 'landscape' ? 'stylesheet.page.summary.landscape' : 'stylesheet.page.summary.portrait', params);
}

export function withPage(sheet: Stylesheet, patch: Partial<PageSetup>): Stylesheet {
  return { ...sheet, page: { ...sheet.page, ...patch } };
}

export function withMargin(sheet: Stylesheet, side: keyof PageMargins, value: number): Stylesheet {
  return withPage(sheet, { margins: { ...sheet.page.margins, [side]: value } });
}

/** The stylesheet with its scale `delta` steps smaller or larger (the whole score drawn smaller or larger). */
export function stepScale(sheet: Stylesheet, delta: number): Stylesheet {
  return { ...sheet, scale: stepNumber(sheet.scale, delta, STYLESHEET_STEPS.scale, STYLESHEET_LIMITS.scale) };
}

/** The stylesheet with a spacing (between systems, tracks, the staff and the tab) `delta` steps less or more. */
export function stepSpacing(sheet: Stylesheet, key: 'systemSpacing' | 'trackSpacing' | 'staffSpacing', delta: number): Stylesheet {
  return withSystems(sheet, { [key]: stepNumber(sheet.systems[key], delta, STYLESHEET_STEPS.spacing, STYLESHEET_LIMITS[key], 1) });
}

export function stepSystemSpacing(sheet: Stylesheet, delta: number): Stylesheet {
  return stepSpacing(sheet, 'systemSpacing', delta);
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
  const family = style.family === '' ? t('stylesheet.texts.style.systemFont') : style.family;
  return [family, `${style.size} pt`, ...(style.isBold ? [t('stylesheet.texts.style.bold')] : []), ...(style.isItalic ? [t('stylesheet.texts.style.italic')] : [])].join(', ');
}

/** The families whose name holds every word typed (any case), the chosen one first, at most `limit`. */
export function matchingFamilies(families: readonly string[], filter: string, chosen: string, limit: number): string[] {
  const words = filter.toLowerCase().split(/\s+/).filter((word) => word !== '');
  const matches = families.filter((family) => words.every((word) => family.toLowerCase().includes(word)));
  const first = chosen !== '' && matches.includes(chosen) ? [chosen] : [];
  return [...first, ...matches.filter((family) => family !== chosen)].slice(0, limit);
}
