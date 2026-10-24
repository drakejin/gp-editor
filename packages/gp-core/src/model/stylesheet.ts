// Guitar Pro 8's Stylesheet (File ▸ Stylesheet…, F7) as the app models it (no TuxGuitar counterpart). Guitar Pro keeps
// its own in a binary stylesheet nobody documents; the app keeps this one as JSON of its own (stylesheet/), so only
// .gp files written by the app hold it. Every default is what the app drew before it had a stylesheet.

/** Guitar Pro 8's page formats the app offers, and a size of the user's own. */
export type PageFormatId = 'a3' | 'a4' | 'a5' | 'b4' | 'b5' | 'letter' | 'legal' | 'tabloid' | 'executive' | 'statement' | 'custom';

export type PageOrientation = 'portrait' | 'landscape';

/** A page format's name and its portrait size in points (1/72 inch). */
export interface PageFormat {
  readonly id: Exclude<PageFormatId, 'custom'>;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** The formats in the order the dialog lists them; A4 and US Letter keep the sizes the PDF export always had. */
export const PAGE_FORMATS: readonly PageFormat[] = [
  { id: 'a4', name: 'A4', width: 595, height: 842 },
  { id: 'letter', name: 'US Letter', width: 612, height: 792 },
  { id: 'a3', name: 'A3', width: 842, height: 1191 },
  { id: 'a5', name: 'A5', width: 420, height: 595 },
  { id: 'b4', name: 'B4', width: 709, height: 1001 },
  { id: 'b5', name: 'B5', width: 499, height: 709 },
  { id: 'legal', name: 'US Legal', width: 612, height: 1008 },
  { id: 'tabloid', name: 'Tabloid', width: 792, height: 1224 },
  { id: 'executive', name: 'Executive', width: 522, height: 756 },
  { id: 'statement', name: 'Statement', width: 396, height: 612 },
];

/** Page margins in millimetres. */
export interface PageMargins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Page & Score Format ▸ Page: the format, its orientation and the margins (PDF, PNG and Print). */
export interface PageSetup {
  readonly format: PageFormatId;
  readonly orientation: PageOrientation;
  /** The page in millimetres when the format is custom, as portrait (the orientation turns it). */
  readonly customWidth: number;
  readonly customHeight: number;
  readonly margins: PageMargins;
}

/** The texts of the score the Stylesheet's Texts & Styles tab sets a font for. */
export type TextElement =
  | 'title'
  | 'subtitle'
  | 'artist'
  | 'album'
  | 'words'
  | 'music'
  | 'tabber'
  | 'copyright'
  | 'tempo'
  | 'trackName'
  | 'chordName'
  | 'lyrics'
  | 'barNumber'
  | 'freeText';

/** Every text element, in the dialog's order. */
export const TEXT_ELEMENTS: readonly TextElement[] = [
  'title', 'subtitle', 'artist', 'album', 'words', 'music', 'tabber', 'copyright', 'tempo', 'trackName', 'chordName', 'lyrics', 'barNumber', 'freeText',
];

/** A text's font: a family installed on the Mac ('' = the system font), its size at 100 % on screen, and its style. */
export interface TextStyle {
  readonly family: string;
  readonly size: number;
  readonly isBold: boolean;
  readonly isItalic: boolean;
}

/** The song information the page's header shows (Header & Footer); the copyright goes under the credits. */
export type HeaderElement = 'title' | 'subtitle' | 'artist' | 'album' | 'words' | 'music' | 'tabber' | 'copyright';

export const HEADER_ELEMENTS: readonly HeaderElement[] = ['title', 'subtitle', 'artist', 'album', 'words', 'music', 'tabber', 'copyright'];

/** Header & Footer: which song information the first page shows, and the page numbers in the PDF's footer. */
export interface HeaderStyle {
  readonly shown: Readonly<Record<HeaderElement, boolean>>;
  readonly showsPageNumbers: boolean;
}

/** Lyrics under the staves (Guitar Pro's default), above them, or not shown. */
export type LyricsPlacement = 'below' | 'above' | 'hidden';

/** Bar numbers on every bar, on the first bar of each system only, or none. */
export type BarNumbers = 'all' | 'systemStart' | 'hidden';

/** A track's name left of its staves in a multitrack system: in full, short ("Dist. Guit.") or not at all. */
export type TrackNameFormat = 'full' | 'short' | 'hidden';

/** Systems & Staves: the room between systems, staves and tracks, bars per system and the multitrack system's names. */
export interface SystemsStyle {
  /** Points added under every system. */
  readonly systemSpacing: number;
  /** Points added between a track's standard notation and its tablature. */
  readonly staffSpacing: number;
  /** Points added between the tracks of a multitrack system. */
  readonly trackSpacing: number;
  /** The most bars a system holds; 0 = as many as fit. */
  readonly barsPerSystem: number;
  /** Bar lines run through the whole multitrack system (else each track's staves have their own). */
  readonly showsBarlinesAcrossSystem: boolean;
  readonly firstSystemNames: TrackNameFormat;
  readonly otherSystemNames: TrackNameFormat;
}

/** The technique labels written on the score that Guitar Pro 8's Texts & Styles lets you rename. */
export type SymbolLabel = 'letRing' | 'palmMute' | 'hammerOn' | 'pullOff' | 'slide' | 'tapping' | 'slap' | 'pop' | 'rasgueado' | 'whammyBar';

export const SYMBOL_LABELS: readonly SymbolLabel[] = ['letRing', 'palmMute', 'hammerOn', 'pullOff', 'slide', 'tapping', 'slap', 'pop', 'rasgueado', 'whammyBar'];

/** Musical symbols and the Notation tab's options the app's engravers honour. */
export interface NotationStyle {
  readonly labels: Readonly<Record<SymbolLabel, string>>;
  /** A let ring or palm mute line goes on over the rests between its notes. */
  readonly showsLinesOverRests: boolean;
  /** "H" / "P" over hammer-ons and pull-offs in the tablature. */
  readonly showsHopoLabels: boolean;
  /** "sl." over slides in the tablature. */
  readonly showsSlideLabels: boolean;
  /** The frets of voices 2, 3 and 4 in their voices' colours in the tablature. */
  readonly showsVoiceColors: boolean;
  readonly showsDynamics: boolean;
  /** 4/4 written C and 2/2 written ¢. */
  readonly showsCommonTime: boolean;
  /** "♩ = 92.5" (else rounded: "♩ = 93"). */
  readonly showsTempoDecimals: boolean;
}

/** A song's stylesheet: absent from a song means DEFAULT_STYLESHEET. */
export interface Stylesheet {
  readonly page: PageSetup;
  /** Overall proportions: every staff, symbol and text of the score drawn this much larger (1 = as the app draws it). */
  readonly scale: number;
  /** Rhythm spacing: the room every beat takes, this much wider. */
  readonly noteSpacing: number;
  readonly systems: SystemsStyle;
  readonly header: HeaderStyle;
  readonly texts: Readonly<Record<TextElement, TextStyle>>;
  readonly lyrics: LyricsPlacement;
  readonly barNumbers: BarNumbers;
  readonly notation: NotationStyle;
}

const SYSTEM_FONT = '';
const plain = (size: number): TextStyle => ({ family: SYSTEM_FONT, size, isBold: false, isItalic: false });
const bold = (size: number): TextStyle => ({ family: SYSTEM_FONT, size, isBold: true, isItalic: false });

/** What the app drew before it had a stylesheet: a song with this stylesheet looks exactly as one without. */
export const DEFAULT_STYLESHEET: Stylesheet = {
  page: { format: 'a4', orientation: 'portrait', customWidth: 210, customHeight: 297, margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  scale: 1,
  noteSpacing: 1,
  systems: {
    systemSpacing: 0, staffSpacing: 0, trackSpacing: 0, barsPerSystem: 0, showsBarlinesAcrossSystem: true, firstSystemNames: 'full', otherSystemNames: 'short',
  },
  header: {
    shown: { title: true, subtitle: true, artist: true, album: true, words: true, music: true, tabber: true, copyright: false },
    showsPageNumbers: true,
  },
  texts: {
    title: bold(26),
    subtitle: plain(16),
    artist: plain(15),
    album: plain(12),
    words: plain(11),
    music: plain(11),
    tabber: plain(11),
    copyright: plain(11),
    tempo: bold(10),
    trackName: plain(10),
    chordName: bold(11),
    lyrics: plain(11),
    barNumber: plain(9),
    freeText: { family: SYSTEM_FONT, size: 10, isBold: false, isItalic: true },
  },
  lyrics: 'below',
  barNumbers: 'all',
  notation: {
    labels: {
      letRing: 'let ring', palmMute: 'P.M.', hammerOn: 'H', pullOff: 'P', slide: 'sl.', tapping: 'T', slap: 'S', pop: 'P', rasgueado: 'rasg.', whammyBar: 'w/bar',
    },
    showsLinesOverRests: false,
    showsHopoLabels: true,
    showsSlideLabels: false,
    showsVoiceColors: true,
    showsDynamics: true,
    showsCommonTime: false,
    showsTempoDecimals: true,
  },
};

/** The ranges a stylesheet's numbers are clamped to (a file's JSON, the dialog's steppers). */
export const STYLESHEET_LIMITS = {
  scale: { min: 0.5, max: 2 },
  noteSpacing: { min: 0.5, max: 3 },
  /** Millimetres. */
  margin: { min: 0, max: 60 },
  pageSize: { min: 50, max: 1000 },
  systemSpacing: { min: 0, max: 120 },
  staffSpacing: { min: 0, max: 80 },
  trackSpacing: { min: 0, max: 120 },
  barsPerSystem: { min: 0, max: 32 },
  textSize: { min: 4, max: 72 },
  familyLength: 64,
  labelLength: 16,
} as const;
