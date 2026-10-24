import type { Track } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { TAB } from '../lib/layout';
import { diagramHeight } from './chord-diagram';
import { NOTATION, notationBandHeight } from './notation';
import { TAB_MARKS } from './symbols/tab-geometry';

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
  /** Effect marks above the tab staff. */
  marks: 16,
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
  gap: 14,
  sidePadding: 24,
} as const;

/** Y positions inside a row; undefined when the band is not shown in the mode. */
export interface RowGeometry {
  /** Baseline of the direction signs; only when the song has directions (`hasDirections`). */
  readonly directionsY?: number;
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
};

type ChordBand = Pick<RowGeometry, 'chordNamesY' | 'chordDiagramsTop'> & { readonly bottom: number };

/** The chord band from `top`: the names line, then the diagrams, then a little room; nothing without either. */
function chordBand(top: number, hasNames: boolean, hasDiagrams: boolean): ChordBand {
  if (!hasNames && !hasDiagrams) {
    return { bottom: top };
  }
  const diagramsTop = top + (hasNames ? ROW.chordNames : 0);
  return {
    chordNamesY: hasNames ? top + ROW.chordNames / 2 : undefined,
    chordDiagramsTop: hasDiagrams ? diagramsTop : undefined,
    bottom: diagramsTop + (hasDiagrams ? diagramHeight() : 0) + ROW.chordsBottom,
  };
}

export function rowGeometry(mode: ScoreMode, stringCount: number, bands: Partial<RowBands> = {}): RowGeometry {
  const { markLaneCount, hasDynamics, hasBends, hasLyrics, hasChordNames, hasChordDiagrams, hasDirections, hasPedals, headingHeight } = { ...PLAIN_ROW, ...bands };
  const directionsY = hasDirections ? headingHeight + ROW.directionsBaseline : undefined;
  const { bottom: chordsBottom, ...chords } = chordBand(headingHeight + (hasDirections ? ROW.directions : 0), hasChordNames, hasChordDiagrams);
  const top = { ...chords, directionsY };
  let y = chordsBottom;
  let notationTop: number | undefined;
  let lyricsY: number | undefined;
  let dynamicsY: number | undefined;
  let pedalsY: number | undefined;
  if (showsNotation(mode)) {
    notationTop = y + NOTATION.above;
    y += notationBandHeight();
    if (hasLyrics) {
      lyricsY = y + ROW.lyrics / 2;
      y += ROW.lyrics;
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
    return { ...top, notationTop, lyricsY, dynamicsY, pedalsY, height: y + ROW.gap };
  }
  const marksBand = ROW.marks + Math.max(0, markLaneCount - 1) * TAB_MARKS.laneHeight;
  // marksY is the centre of the lowest lane; further lanes stack upwards from it.
  const marksY = y + marksBand - ROW.marks / 2;
  const tabTop = y + marksBand + (hasBends ? ROW.bends : 0);
  y = tabTop + Math.max(0, stringCount - 1) * TAB.stringGap + (mode === 'tab' ? ROW.rhythm : ROW.tabBottom);
  if (hasLyrics && lyricsY === undefined) {
    lyricsY = y + ROW.lyrics / 2;
    y += ROW.lyrics;
  }
  if (hasDynamics && dynamicsY === undefined) {
    dynamicsY = y + ROW.dynamicsBaseline;
    y += ROW.dynamics;
  }
  if (hasPedals && pedalsY === undefined) {
    pedalsY = y + ROW.pedalsBaseline;
    y += ROW.pedals;
  }
  return { ...top, notationTop, lyricsY, dynamicsY, pedalsY, marksY, tabTop, height: y + ROW.gap };
}
