// Port of TuxGuitar app.tuxguitar.io.ptb.base (PTSong, PTSongInfo, PTTrack, PTTrackInfo, PTSection, PTPosition and the
// PTComponent classes) (LGPL-2.1): a Power Tab file as read, before it becomes a Song.
import type { TripletFeel } from '../../model/song';

/** PTDirection.DIRECTION_*: musical directions (codas, segnos, D.C. / D.S. jumps, fine). */
export const PT_DIRECTION = {
  CODA: 0,
  DOUBLE_CODA: 1,
  SEGNO: 2,
  SEGNO_SEGNO: 3,
  FINE: 4,
  DA_CAPO: 5,
  DAL_SEGNO: 6,
  DAL_SEGNO_SEGNO: 7,
  TO_CODA: 8,
  TO_DOUBLE_CODA: 9,
  DA_CAPO_AL_CODA: 10,
  DA_CAPO_AL_DOUBLE_CODA: 11,
  DAL_SEGNO_AL_CODA: 12,
  DAL_SEGNO_AL_DOUBLE_CODA: 13,
  DAL_SEGNO_SEGNO_AL_CODA: 14,
  DAL_SEGNO_SEGNO_AL_DOUBLE_CODA: 15,
  DA_CAPO_AL_FINE: 16,
  DAL_SEGNO_AL_FINE: 17,
  DAL_SEGNO_SEGNO_AL_FINE: 18,
} as const;

/** PTDirection.ACTIVE_SYMBOL_*: the jump a direction answers to (0 = none). */
export const PT_ACTIVE_SYMBOL = { NONE: 0, DC: 1, DS: 2, DSS: 3 } as const;

/** PTBar: a bar line; a time signature with numerator 0 means "none" (the end bar of a section). */
export interface PtBar {
  readonly kind: 'bar';
  readonly repeatStart: boolean;
  /** Repetitions when a repeat closes here; 0 = none. */
  readonly repeatClose: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface PtNote {
  /** Fret. */
  readonly value: number;
  /** 1 = highest string. */
  readonly string: number;
  /** Bend type 1–8 (PTSongParser.makeBend); 0 = none. */
  readonly bend: number;
  readonly tied: boolean;
  readonly dead: boolean;
  readonly slide: boolean;
}

/** PTBeat: one rhythm position of a staff's voice. */
export interface PtBeat {
  readonly kind: 'beat';
  readonly staff: number;
  readonly voice: number;
  /** Bars a multi-bar rest lasts; 1 for any other beat. */
  readonly multiBarRest: number;
  /** Note value as written (1 = whole … 64). */
  readonly duration: number;
  readonly enters: number;
  readonly times: number;
  readonly dotted: boolean;
  readonly doubleDotted: boolean;
  readonly vibrato: boolean;
  readonly grace: boolean;
  readonly arpeggioUp: boolean;
  readonly arpeggioDown: boolean;
  readonly notes: readonly PtNote[];
}

export interface PtDirection {
  readonly kind: 'direction';
  /** One of PT_DIRECTION. */
  readonly direction: number;
  /** One of PT_ACTIVE_SYMBOL. */
  readonly activeSymbol: number;
  /** The repeat pass it applies to; 0 = any. */
  readonly repeat: number;
}

/** PTGuitarIn: from here on, staff `staff` is played by the guitars whose numbers are set bits of `trackInfo`. */
export interface PtGuitarIn {
  readonly kind: 'guitarIn';
  readonly staff: number;
  readonly trackInfo: number;
}

/** PTSymbol: alternate endings, one bit per ending (bit 0 = ending 1). */
export interface PtSymbol {
  readonly kind: 'symbol';
  readonly endNumber: number;
}

export interface PtTempo {
  readonly kind: 'tempo';
  readonly tempo: number;
  readonly tripletFeel: TripletFeel;
}

export type PtComponent = PtBar | PtBeat | PtDirection | PtGuitarIn | PtSymbol | PtTempo;

export interface PtPosition {
  readonly position: number;
  readonly components: readonly PtComponent[];
}

/** PTSection: one system of the score. */
export interface PtSection {
  readonly number: number;
  readonly staffs: number;
  readonly positions: readonly PtPosition[];
}

/** PTTrackInfo: a guitar of the guitar or bass score. */
export interface PtTrackInfo {
  readonly number: number;
  readonly name: string;
  readonly instrument: number;
  readonly volume: number;
  readonly balance: number;
  /** MIDI pitch per string, highest string first. */
  readonly strings: readonly number[];
}

/** PTTrack: the guitar score or the bass score. */
export interface PtTrack {
  readonly sections: readonly PtSection[];
  readonly infos: readonly PtTrackInfo[];
}

/** PTSongInfo; strings a file does not hold are ''. */
export interface PtSongInfo {
  readonly name: string;
  readonly interpret: string;
  readonly album: string;
  readonly author: string;
  readonly lyricist: string;
  readonly arranger: string;
  readonly guitarTranscriber: string;
  readonly bassTranscriber: string;
  readonly copyright: string;
  readonly guitarInstructions: string;
  readonly bassInstructions: string;
  /** A lesson's instructions (classification 1). */
  readonly instructions: string;
}

export interface PtSong {
  readonly info: PtSongInfo;
  readonly track1: PtTrack;
  readonly track2: PtTrack;
}

/** PTTrack.getInfo: the first guitar whose number is a set bit of `bits`. */
export function findTrackInfo(track: PtTrack, bits: number): PtTrackInfo | undefined {
  return track.infos.find((info) => ((1 << info.number) & bits) !== 0);
}

/** PTTrack.getDefaultInfo: the guitar with the lowest number. */
export function defaultTrackInfo(track: PtTrack): PtTrackInfo | undefined {
  return track.infos.reduce<PtTrackInfo | undefined>(
    (best, info) => (best === undefined || info.number < best.number ? info : best),
    undefined,
  );
}

/** PTSection.sort: positions in order. */
export function sortSection(section: PtSection): PtSection {
  const positions = [...section.positions].sort((a, b) => a.position - b.position).map(sortPosition);
  return { ...section, positions };
}

/** PTPosition.sort: directions after every other component, each group in reading order. */
function sortPosition(position: PtPosition): PtPosition {
  const isDirection = (component: PtComponent): boolean => component.kind === 'direction';
  const components = [
    ...position.components.filter((component) => !isDirection(component)),
    ...position.components.filter(isDirection),
  ];
  return { ...position, components };
}
