// A stylesheet and a bar's Design Mode layout from untrusted JSON (a saved file's entries; no TuxGuitar counterpart):
// every value of the wrong kind takes its default, numbers are clamped into range, texts lose control characters.
import { isJsonObject, ownValue } from '../effects/effects-json';
import type { BarDesign, BeatOffset } from '../model/song';
import {
  type BarNumbers,
  DEFAULT_STYLESHEET,
  HEADER_ELEMENTS,
  type HeaderStyle,
  type LyricsPlacement,
  type NotationStyle,
  PAGE_FORMATS,
  type PageFormatId,
  type PageMargins,
  type PageOrientation,
  type PageSetup,
  SYMBOL_LABELS,
  STYLESHEET_LIMITS,
  type Stylesheet,
  type SystemsStyle,
  TEXT_ELEMENTS,
  type TextStyle,
  type TrackNameFormat,
} from '../model/stylesheet';

type JsonObject = Readonly<Record<string, unknown>>;

interface Range {
  readonly min: number;
  readonly max: number;
}

/** Design Mode's bounds: a beat moves at most this far, a bar is this much narrower or wider, a system this long. */
export const BAR_DESIGN_LIMITS = {
  beatOffset: { min: -200, max: 200 },
  widthScale: { min: 0.25, max: 4 },
  systemBars: { min: 0, max: 64 },
  /** Moved beats kept per bar. */
  beatOffsets: 256,
} as const;

const PAGE_FORMAT_IDS: readonly PageFormatId[] = [...PAGE_FORMATS.map((format) => format.id), 'custom'];
const ORIENTATIONS: readonly PageOrientation[] = ['portrait', 'landscape'];
const LYRICS_PLACEMENTS: readonly LyricsPlacement[] = ['below', 'above', 'hidden'];
const BAR_NUMBERS: readonly BarNumbers[] = ['all', 'systemStart', 'hidden'];
const TRACK_NAME_FORMATS: readonly TrackNameFormat[] = ['full', 'short', 'hidden'];
/** C0 controls and DEL: never part of a font name or a label. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** `value` rounded to `decimals` places. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** A number in range (rounded); anything else is `fallback`. */
function numberIn(raw: unknown, fallback: number, range: Range, decimals: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? roundTo(Math.min(range.max, Math.max(range.min, raw)), decimals) : fallback;
}

function choiceOf<T extends string>(raw: unknown, choices: readonly T[], fallback: T): T {
  return choices.find((choice) => choice === raw) ?? fallback;
}

function booleanOr(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

/** A string without control characters, cut to `maxLength`; anything else is `fallback`. */
function textOr(raw: unknown, fallback: string, maxLength: number): string {
  return typeof raw === 'string' ? raw.replace(CONTROL_CHARACTERS, '').slice(0, maxLength) : fallback;
}

function objectOf(raw: unknown): JsonObject {
  return isJsonObject(raw) ? raw : {};
}

function parseMargins(raw: unknown): PageMargins {
  const object = objectOf(raw);
  const fallback = DEFAULT_STYLESHEET.page.margins;
  const margin = (key: keyof PageMargins) => numberIn(ownValue(object, key), fallback[key], STYLESHEET_LIMITS.margin, 1);
  return { top: margin('top'), right: margin('right'), bottom: margin('bottom'), left: margin('left') };
}

function parsePage(raw: unknown): PageSetup {
  const object = objectOf(raw);
  const fallback = DEFAULT_STYLESHEET.page;
  return {
    format: choiceOf(ownValue(object, 'format'), PAGE_FORMAT_IDS, fallback.format),
    orientation: choiceOf(ownValue(object, 'orientation'), ORIENTATIONS, fallback.orientation),
    customWidth: numberIn(ownValue(object, 'customWidth'), fallback.customWidth, STYLESHEET_LIMITS.pageSize, 1),
    customHeight: numberIn(ownValue(object, 'customHeight'), fallback.customHeight, STYLESHEET_LIMITS.pageSize, 1),
    margins: parseMargins(ownValue(object, 'margins')),
  };
}

function parseSystems(raw: unknown): SystemsStyle {
  const object = objectOf(raw);
  const fallback = DEFAULT_STYLESHEET.systems;
  const spacing = (key: 'systemSpacing' | 'staffSpacing' | 'trackSpacing') => numberIn(ownValue(object, key), fallback[key], STYLESHEET_LIMITS[key], 1);
  return {
    systemSpacing: spacing('systemSpacing'),
    staffSpacing: spacing('staffSpacing'),
    trackSpacing: spacing('trackSpacing'),
    barsPerSystem: numberIn(ownValue(object, 'barsPerSystem'), fallback.barsPerSystem, STYLESHEET_LIMITS.barsPerSystem, 0),
    showsBarlinesAcrossSystem: booleanOr(ownValue(object, 'showsBarlinesAcrossSystem'), fallback.showsBarlinesAcrossSystem),
    firstSystemNames: choiceOf(ownValue(object, 'firstSystemNames'), TRACK_NAME_FORMATS, fallback.firstSystemNames),
    otherSystemNames: choiceOf(ownValue(object, 'otherSystemNames'), TRACK_NAME_FORMATS, fallback.otherSystemNames),
  };
}

function parseHeader(raw: unknown): HeaderStyle {
  const object = objectOf(raw);
  const shown = objectOf(ownValue(object, 'shown'));
  const fallback = DEFAULT_STYLESHEET.header;
  return {
    shown: Object.fromEntries(HEADER_ELEMENTS.map((element) => [element, booleanOr(ownValue(shown, element), fallback.shown[element])])) as HeaderStyle['shown'],
    showsPageNumbers: booleanOr(ownValue(object, 'showsPageNumbers'), fallback.showsPageNumbers),
  };
}

export function parseTextStyle(raw: unknown, fallback: TextStyle): TextStyle {
  const object = objectOf(raw);
  return {
    family: textOr(ownValue(object, 'family'), fallback.family, STYLESHEET_LIMITS.familyLength),
    size: numberIn(ownValue(object, 'size'), fallback.size, STYLESHEET_LIMITS.textSize, 1),
    isBold: booleanOr(ownValue(object, 'isBold'), fallback.isBold),
    isItalic: booleanOr(ownValue(object, 'isItalic'), fallback.isItalic),
  };
}

function parseTexts(raw: unknown): Stylesheet['texts'] {
  const object = objectOf(raw);
  return Object.fromEntries(TEXT_ELEMENTS.map((element) => [element, parseTextStyle(ownValue(object, element), DEFAULT_STYLESHEET.texts[element])])) as Stylesheet['texts'];
}

function parseNotation(raw: unknown): NotationStyle {
  const object = objectOf(raw);
  const fallback = DEFAULT_STYLESHEET.notation;
  const labels = objectOf(ownValue(object, 'labels'));
  const flag = (key: Exclude<keyof NotationStyle, 'labels'>) => booleanOr(ownValue(object, key), fallback[key]);
  return {
    labels: Object.fromEntries(SYMBOL_LABELS.map((label) => [label, textOr(ownValue(labels, label), fallback.labels[label], STYLESHEET_LIMITS.labelLength)])) as NotationStyle['labels'],
    showsLinesOverRests: flag('showsLinesOverRests'),
    showsHopoLabels: flag('showsHopoLabels'),
    showsSlideLabels: flag('showsSlideLabels'),
    showsVoiceColors: flag('showsVoiceColors'),
    showsDynamics: flag('showsDynamics'),
    showsCommonTime: flag('showsCommonTime'),
    showsTempoDecimals: flag('showsTempoDecimals'),
  };
}

/** A whole stylesheet from untrusted JSON; whatever is missing or wrong takes DEFAULT_STYLESHEET's value. */
export function parseStylesheet(raw: unknown): Stylesheet {
  const object = objectOf(raw);
  const fallback = DEFAULT_STYLESHEET;
  return {
    page: parsePage(ownValue(object, 'page')),
    scale: numberIn(ownValue(object, 'scale'), fallback.scale, STYLESHEET_LIMITS.scale, 2),
    noteSpacing: numberIn(ownValue(object, 'noteSpacing'), fallback.noteSpacing, STYLESHEET_LIMITS.noteSpacing, 2),
    systems: parseSystems(ownValue(object, 'systems')),
    header: parseHeader(ownValue(object, 'header')),
    texts: parseTexts(ownValue(object, 'texts')),
    lyrics: choiceOf(ownValue(object, 'lyrics'), LYRICS_PLACEMENTS, fallback.lyrics),
    barNumbers: choiceOf(ownValue(object, 'barNumbers'), BAR_NUMBERS, fallback.barNumbers),
    notation: parseNotation(ownValue(object, 'notation')),
  };
}

/** Moved beats: a whole, non-negative start each, the first offset per start, in start order; offsets of 0 dropped. */
function parseBeatOffsets(raw: unknown): BeatOffset[] {
  const items: readonly unknown[] = Array.isArray(raw) ? raw : [];
  const byStart = new Map<number, number>();
  items.forEach((item) => {
    const object = objectOf(item);
    const at = ownValue(object, 'at');
    const offset = numberIn(ownValue(object, 'offset'), 0, BAR_DESIGN_LIMITS.beatOffset, 1);
    if (typeof at === 'number' && Number.isSafeInteger(at) && at >= 0 && !byStart.has(at) && offset !== 0) {
      byStart.set(at, offset);
    }
  });
  return [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, BAR_DESIGN_LIMITS.beatOffsets)
    .map(([at, offset]) => ({ at, offset }));
}

/** A bar's Design Mode layout from untrusted JSON; undefined when nothing of it differs from the bar as laid out. */
export function parseBarDesign(raw: unknown): BarDesign | undefined {
  if (!isJsonObject(raw)) {
    return undefined;
  }
  const systemBars = ownValue(raw, 'systemBars');
  const widthScale = numberIn(ownValue(raw, 'widthScale'), 1, BAR_DESIGN_LIMITS.widthScale, 2);
  const beatOffsets = parseBeatOffsets(ownValue(raw, 'beatOffsets'));
  const design: BarDesign = {
    ...(typeof systemBars === 'number' && Number.isFinite(systemBars) ? { systemBars: numberIn(systemBars, 0, BAR_DESIGN_LIMITS.systemBars, 0) } : {}),
    ...(widthScale === 1 ? {} : { widthScale }),
    ...(beatOffsets.length === 0 ? {} : { beatOffsets }),
  };
  return Object.keys(design).length === 0 ? undefined : design;
}

/** Whether two JSON-like values (objects, arrays, strings, numbers, booleans, undefined) are equal, deeply. */
export function isSameJson(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item: unknown, i) => isSameJson(item, b[i]));
  }
  if (!isJsonObject(a) || !isJsonObject(b)) {
    return false;
  }
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  const otherKeys = Object.keys(b).filter((key) => b[key] !== undefined);
  return keys.length === otherKeys.length && keys.every((key) => isSameJson(a[key], ownValue(b, key)));
}
