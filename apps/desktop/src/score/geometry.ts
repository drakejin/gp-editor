import type { Track } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { TAB } from '../lib/layout';
import { diagramHeight } from './chord-diagram';
import { NOTATION, STAFF_HEIGHT } from './notation';
import { TAB_MARKS, tabStringY } from './symbols/tab-geometry';

/** What the score shows: standard notation and tab (default), notation only, or tab only. */
export type ScoreMode = 'notationAndTab' | 'notation' | 'tab';

export const SCORE_MODES: readonly ScoreMode[] = ['notationAndTab', 'notation', 'tab'];

/** Names of the modes on buttons and menus, read in the language shown when they are read (getters). */
export const SCORE_MODE_LABELS: Readonly<Record<ScoreMode, string>> = {
  get notationAndTab() {
    return t('palette.score.mode.notationAndTab');
  },
  get notation() {
    return t('palette.score.mode.notation');
  },
  get tab() {
    return t('palette.score.mode.tab');
  },
};

/** A score mode from outside (a native event); anything unknown is the default, score + tab. */
export function toScoreMode(value: unknown): ScoreMode {
  return SCORE_MODES.find((mode) => mode === value) ?? 'notationAndTab';
}

/** The two staves a view can show (Guitar Pro's notation toggles in the Track inspector). */
export type Staff = 'standard' | 'tab';

export function showsStaff(mode: ScoreMode, staff: Staff): boolean {
  return staff === 'standard' ? mode !== 'tab' : mode !== 'notation';
}

/** The mode with one staff switched on or off; the last staff shown stays on. */
export function toggleStaff(mode: ScoreMode, staff: Staff): ScoreMode {
  const standard = staff === 'standard' ? !showsStaff(mode, 'standard') : showsStaff(mode, 'standard');
  const tab = staff === 'tab' ? !showsStaff(mode, 'tab') : showsStaff(mode, 'tab');
  if (standard && tab) {
    return 'notationAndTab';
  }
  return standard ? 'notation' : tab ? 'tab' : mode;
}

/** Vertical bands of a score row, in points. */
export const ROW = {
  /** Measure numbers, markers, tempo and alternate endings. */
  heading: 34,
  /** The heading of a row showing no tempo, triplet feel, ending or repeat count: its bar number and markers. */
  headingCompact: 16,
  /** Effect marks above the tab staff. */
  marks: 16,
  /** Above the tab staff of a row without effect marks: its top string's frets clear of what is above. */
  marksEmpty: 10,
  /** Bend arrows and their amounts, between the marks and the tab staff (tip, highest stack and label: 28 above the top string). */
  bends: 26,
  /** Under the tab staff when rhythm is drawn there (tab-only mode). */
  rhythm: 34,
  /** Under the tab staff otherwise. */
  tabBottom: 10,
  /** The lyrics line under the notation staff, or under the tab staff when notation is hidden. */
  lyrics: 18,
  /** Dynamics (p, mf, ff …) under the notation staff, or under the tab staff when notation is hidden. */
  dynamics: 22,
  /** Baseline of the dynamics, from the top of their band. */
  dynamicsBaseline: 13,
  /** The chord names line under the heading; the diagrams follow it (`diagramHeight`). */
  chordNames: 16,
  /** Directions (segno, coda, D.S. al Coda …) under the heading, when the song has any. */
  directions: 22,
  /** Baseline of the direction signs, from the top of their band. */
  directionsBaseline: 18,
  /** The sustain pedal (Ped. ✱) under the dynamics, when the track has pedal marks. */
  pedals: 20,
  /** Baseline of the pedal marks, from the top of their band. */
  pedalsBaseline: 13,
  /** Under the chord band, before the staff's own room. */
  chordsBottom: 6,
  /** The beats' free texts (Guitar Pro's text above the beat), under the directions, when the track has any. */
  freeText: 16,
  gap: 14,
  sidePadding: 24,
} as const;

/** Y positions inside a row; undefined when the band is not shown in the mode. */
export interface RowGeometry {
  /** The heading band's height (bar numbers, markers, tempo, endings), or the room over a staff under another's. */
  readonly headingHeight?: number;
  /** Baseline of the direction signs; only when the song has directions (`hasDirections`). */
  readonly directionsY?: number;
  /** Centre of the free texts line; only when a beat of the track has a text (`hasFreeTexts`). */
  readonly freeTextY?: number;
  /** Baseline of the sustain pedal marks; only when the track has pedal marks (`hasPedals`). */
  readonly pedalsY?: number;
  /** Centre of the chord names line; only when the track has named chords and names are shown (`chordBands`). */
  readonly chordNamesY?: number;
  /** Top of the chord diagrams; only when a chord of the track has a diagram and diagrams are shown. */
  readonly chordDiagramsTop?: number;
  /** Top line of the notation staff. */
  readonly notationTop?: number;
  /** Centre of the lyrics line; only when the track has lyrics (`hasLyrics`). */
  readonly lyricsY?: number;
  /** Baseline of the dynamics; only when the track changes dynamic (`hasDynamicChanges`). */
  readonly dynamicsY?: number;
  /** Centre of the lowest effect-mark lane. */
  readonly marksY?: number;
  /** First (highest) string of the tab staff. */
  readonly tabTop?: number;
  /** Where annotation boxes over the staves hang from: the bottom of their band under the heading (only with `annotationsAbove`). */
  readonly annotationsAboveBottom?: number;
  /** Where annotation boxes under the staves hang from: the top of their band before the gap (only with `annotationsBelow`). */
  readonly annotationsBelowTop?: number;
  readonly height: number;
}

export function showsNotation(mode: ScoreMode): boolean {
  return mode !== 'tab';
}

export function showsTab(mode: ScoreMode): boolean {
  return mode !== 'notation';
}

/** The neck above the score comes with the tab (Score + Tab and Tab modes); percussion tracks have no neck. */
export function showsFretboard(mode: ScoreMode, track: Track): boolean {
  return showsTab(mode) && !track.isPercussion;
}

/** The bands a track's rows make room for, the same in every row (the score list uses one row height). */
export interface RowBands {
  /** Effect-mark lanes above the tab staff, one per kind of mark the track uses (`tabMarkLanes`). */
  readonly markLaneCount: number;
  /** The track changes dynamic somewhere (`hasDynamicChanges`): the dynamics band, under the notation staff, else under the tab. */
  readonly hasDynamics: boolean;
  /** A note of the track bends (`hasBends`): the bend band above the tab staff. */
  readonly hasBends: boolean;
  /** The track has lyrics (`hasLyrics`): their line under the notation staff, else under the tab. */
  readonly hasLyrics: boolean;
  /** Chord names shown over the staves (`chordBands`). */
  readonly hasChordNames: boolean;
  /** Chord diagrams shown over the staves, under the names. */
  readonly hasChordDiagrams: boolean;
  /** The song has musical directions (`hasDirections`): their band under the heading. */
  readonly hasDirections: boolean;
  /** The track has sustain pedal marks (`hasPedals`): their band under the dynamics. */
  readonly hasPedals: boolean;
  /** The heading band's height: ROW.heading, or a staff's room under the one above it in a multitrack system. */
  readonly headingHeight: number;
  /** A beat of the track has a free text (`hasFreeTexts`): its line under the directions. */
  readonly hasFreeTexts: boolean;
  /** The lyrics above the staves (the stylesheet's choice), not under them. */
  readonly hasLyricsAbove: boolean;
  /** Room added between the notation staff and the tab staff (the stylesheet's staff spacing). */
  readonly staffSpacing: number;
  /** The notation's room above its top line and below its bottom line: the row's ink and a little (`row-bands.ts`). */
  readonly notationAbove: number;
  readonly notationBelow: number;
  /** The tab's ink above its top string and below its bottom one, and a little: the room over and under it is at least this. */
  readonly tabAbove: number;
  readonly tabBelow: number;
  /** The text lines' heights, for the stylesheet's font sizes: lyrics, chord names, free texts. */
  readonly lyricsHeight: number;
  readonly chordNamesHeight: number;
  readonly freeTextHeight: number;
  /** Room for annotation boxes under the heading and under the staves: 0 for none (score/annotations.ts, per row). */
  readonly annotationsAbove: number;
  readonly annotationsBelow: number;
}

const PLAIN_ROW: RowBands = {
  markLaneCount: 1,
  hasDynamics: false,
  hasBends: false,
  hasLyrics: false,
  hasChordNames: false,
  hasChordDiagrams: false,
  hasDirections: false,
  hasPedals: false,
  headingHeight: ROW.heading,
  hasFreeTexts: false,
  hasLyricsAbove: false,
  staffSpacing: 0,
  notationAbove: NOTATION.above,
  notationBelow: NOTATION.below,
  tabAbove: 0,
  tabBelow: 0,
  lyricsHeight: ROW.lyrics,
  chordNamesHeight: ROW.chordNames,
  freeTextHeight: ROW.freeText,
  annotationsAbove: 0,
  annotationsBelow: 0,
};

type ChordBand = Pick<RowGeometry, 'chordNamesY' | 'chordDiagramsTop'> & { readonly bottom: number };

/** The chord band from `top`: the names line, then the diagrams, then a little room; nothing without either. */
function chordBand(top: number, bands: RowBands): ChordBand {
  const { hasChordNames: hasNames, hasChordDiagrams: hasDiagrams, chordNamesHeight } = bands;
  if (!hasNames && !hasDiagrams) {
    return { bottom: top };
  }
  const diagramsTop = top + (hasNames ? chordNamesHeight : 0);
  return {
    chordNamesY: hasNames ? top + chordNamesHeight / 2 : undefined,
    chordDiagramsTop: hasDiagrams ? diagramsTop : undefined,
    bottom: diagramsTop + (hasDiagrams ? diagramHeight() : 0) + ROW.chordsBottom,
  };
}

/** The bands over the staves: directions, free texts, chords and (above the staves) lyrics; `bottom` is where the staves' room starts. */
function topBands(bands: RowBands): Pick<RowGeometry, 'headingHeight' | 'directionsY' | 'freeTextY' | 'chordNamesY' | 'chordDiagramsTop' | 'lyricsY'> & { readonly bottom: number } {
  const { hasDirections, headingHeight, hasFreeTexts, freeTextHeight, hasLyrics, hasLyricsAbove, lyricsHeight } = bands;
  const directionsY = hasDirections ? headingHeight + ROW.directionsBaseline : undefined;
  const textTop = headingHeight + (hasDirections ? ROW.directions : 0);
  const freeTextY = hasFreeTexts ? textTop + freeTextHeight / 2 : undefined;
  const { bottom: chordsBottom, ...chords } = chordBand(textTop + (hasFreeTexts ? freeTextHeight : 0), bands);
  const isAbove = hasLyrics && hasLyricsAbove;
  return {
    headingHeight, ...chords, directionsY, ...(freeTextY === undefined ? {} : { freeTextY }),
    ...(isAbove ? { lyricsY: chordsBottom + lyricsHeight / 2 } : {}), bottom: chordsBottom + (isAbove ? lyricsHeight : 0),
  };
}

/** The bands over the staves (topBands) under the annotations' band, which comes right under the heading. */
function annotatedTopBands(bands: RowBands): ReturnType<typeof topBands> & Pick<RowGeometry, 'annotationsAboveBottom'> {
  const { headingHeight, annotationsAbove } = bands;
  const top = topBands({ ...bands, headingHeight: headingHeight + annotationsAbove });
  return annotationsAbove > 0 ? { ...top, headingHeight, annotationsAboveBottom: headingHeight + annotationsAbove } : top;
}

/** The annotations' band under the staves' last band (from `y`), then the gap: the row's height. */
function rowBottom(y: number, bands: RowBands): Pick<RowGeometry, 'annotationsBelowTop' | 'height'> {
  const { annotationsBelow } = bands;
  return { ...(annotationsBelow > 0 ? { annotationsBelowTop: y } : {}), height: y + annotationsBelow + ROW.gap };
}

export function rowGeometry(mode: ScoreMode, stringCount: number, partial: Partial<RowBands> = {}): RowGeometry {
  const bands: RowBands = { ...PLAIN_ROW, ...partial };
  const { markLaneCount, hasDynamics, hasBends, hasPedals, lyricsHeight } = bands;
  const { bottom, lyricsY: lyricsAboveY, ...top } = annotatedTopBands(bands);
  const hasLyricsBelow = bands.hasLyrics && !bands.hasLyricsAbove;
  let y = bottom;
  let notationTop: number | undefined;
  let lyricsY = lyricsAboveY;
  let dynamicsY: number | undefined;
  let pedalsY: number | undefined;
  if (showsNotation(mode)) {
    notationTop = y + bands.notationAbove;
    y += bands.notationAbove + STAFF_HEIGHT + bands.notationBelow;
    if (hasLyricsBelow) {
      lyricsY = y + lyricsHeight / 2;
      y += lyricsHeight;
    }
    if (hasDynamics) {
      dynamicsY = y + ROW.dynamicsBaseline;
      y += ROW.dynamics;
    }
    if (hasPedals) {
      pedalsY = y + ROW.pedalsBaseline;
      y += ROW.pedals;
    }
  }
  if (!showsTab(mode)) {
    return { ...top, notationTop, lyricsY, dynamicsY, pedalsY, ...rowBottom(y, bands) };
  }
  y += notationTop === undefined ? 0 : bands.staffSpacing;
  const marksBand = markLaneCount === 0 ? ROW.marksEmpty : ROW.marks + (markLaneCount - 1) * TAB_MARKS.laneHeight;
  const overTab = marksBand + (hasBends ? ROW.bends : 0);
  // What reaches higher than the marks and bends (a hammer-on's arc and its H) gets room above them.
  y += Math.max(0, bands.tabAbove - overTab);
  // marksY is the centre of the lowest lane; further lanes stack upwards from it.
  const marksY = y + marksBand - ROW.marks / 2;
  const tabTop = y + overTab;
  y = tabTop + Math.max(0, stringCount - 1) * TAB.stringGap + Math.max(mode === 'tab' ? ROW.rhythm : ROW.tabBottom, bands.tabBelow);
  if (hasLyricsBelow && lyricsY === undefined) {
    lyricsY = y + lyricsHeight / 2;
    y += lyricsHeight;
  }
  if (hasDynamics && dynamicsY === undefined) {
    dynamicsY = y + ROW.dynamicsBaseline;
    y += ROW.dynamics;
  }
  if (hasPedals && pedalsY === undefined) {
    pedalsY = y + ROW.pedalsBaseline;
    y += ROW.pedals;
  }
  return { ...top, notationTop, lyricsY, dynamicsY, pedalsY, marksY, tabTop, ...rowBottom(y, bands) };
}

/** Where a row's staves run: the notation's top line (else the tab's top string) to the tab's bottom string (else the notation's bottom line). */
export interface StavesSpan {
  readonly top: number;
  readonly bottom: number;
  /** The notation's bottom line, when the row shows notation. */
  readonly notationBottom?: number;
}

export function stavesSpan(geometry: RowGeometry, stringCount: number): StavesSpan | undefined {
  const { notationTop, tabTop } = geometry;
  const notationBottom = notationTop === undefined ? undefined : notationTop + STAFF_HEIGHT;
  const top = notationTop ?? tabTop;
  const bottom = tabTop === undefined ? notationBottom : tabStringY(tabTop, stringCount);
  return top === undefined || bottom === undefined ? undefined : { top, bottom, notationBottom };
}
