// Port of TuxGuitar app.tuxguitar.io.gpx.score.* (LGPL-2.1): the intermediate GPIF document.

/** Which GPIF dialect: 6 = Guitar Pro 6 (.gpx), 7 = Guitar Pro 7/8 (.gp). */
export type GpifVersion = 6 | 7;

export const DEFAULT_PERCUSSION_CHANNEL = 9;

export interface GpifScore {
  readonly title: string;
  readonly subTitle: string;
  readonly artist: string;
  readonly album: string;
  readonly words: string;
  readonly music: string;
  readonly wordsAndMusic: string;
  readonly copyright: string;
  readonly tabber: string;
  readonly instructions: string;
  readonly notices: string;
}

export interface GpifAutomation {
  readonly type: string;
  readonly barId: number;
  /** Position inside the bar, 0–1. */
  readonly position: number;
  readonly value: readonly number[] | undefined;
}

export interface GpifChord {
  readonly id: number;
  readonly name: string;
  /** Undefined for chords without a diagram (GP7 ChordCollection). */
  readonly diagram: GpifChordDiagram | undefined;
}

export interface GpifChordDiagram {
  readonly stringCount: number;
  readonly baseFret: number;
  /** Fret per GPIF string (index 0 = lowest string); undefined = not played. */
  readonly frets: readonly (number | undefined)[];
}

export interface GpifLyricsLine {
  readonly text: string;
  /** 0-based bar index where the line starts. */
  readonly offset: number;
}

export type GpifPlaybackState = 'default' | 'solo' | 'mute';

export interface GpifTrack {
  readonly id: number;
  readonly name: string;
  readonly color: readonly number[] | undefined;
  /** Open-string pitches, lowest string first. */
  readonly tuningPitches: readonly number[] | undefined;
  readonly capo: number;
  readonly gmProgram: number;
  /** MIDI bank of the first sound (GP7: MSB/LSB); 0 when unknown. */
  readonly gmBank: number;
  readonly gmChannel1: number;
  readonly gmChannel2: number;
  /** RSE channel strip volume and pan, 0–1. */
  readonly volume: number | undefined;
  readonly balance: number | undefined;
  readonly playbackState: GpifPlaybackState;
  /** Number of staves (GP7); each staff has its own bar in every master bar. */
  readonly staffCount: number;
  readonly lyrics: readonly GpifLyricsLine[];
  readonly chords: ReadonlyMap<number, GpifChord>;
}

export interface GpifMasterBar {
  /** One bar id per staff of every track. */
  readonly barIds: readonly number[];
  readonly time: readonly number[] | undefined;
  readonly repeatStart: boolean;
  /** Repeat count minus one when the repeat closes here, else 0. */
  readonly repeatCount: number;
  readonly accidentalCount: number;
  readonly mode: string | undefined;
  readonly tripletFeel: string | undefined;
  readonly alternateEndings: readonly number[] | undefined;
  readonly markerText: string | undefined;
}

export interface GpifBar {
  readonly id: number;
  readonly voiceIds: readonly number[];
  readonly clef: string | undefined;
  readonly simileMark: string | undefined;
}

export interface GpifVoice {
  readonly id: number;
  readonly beatIds: readonly number[];
}

/** Bend or whammy curve, GPIF units: values in 1/100 tone (100 = full tone), offsets 0–100. */
export interface GpifBendCurve {
  readonly originValue: number | undefined;
  readonly middleValue: number | undefined;
  readonly destinationValue: number | undefined;
  readonly originOffset: number | undefined;
  readonly middleOffset1: number | undefined;
  readonly middleOffset2: number | undefined;
  readonly destinationOffset: number | undefined;
}

export interface GpifBeat {
  readonly id: number;
  readonly rhythmId: number;
  readonly noteIds: readonly number[] | undefined;
  readonly dynamic: string | undefined;
  readonly slapped: boolean;
  readonly popped: boolean;
  /** Brush direction ('' when none). */
  readonly brush: string;
  /** Brush duration in ticks (XProperty 687935489). */
  readonly brushDuration: number | undefined;
  /** Pick stroke direction ('' when none). */
  readonly pickStroke: string;
  readonly tremolo: readonly number[] | undefined;
  readonly fadding: string | undefined;
  readonly text: string;
  readonly chordId: number | undefined;
  readonly graceNotes: string | undefined;
  readonly whammyBarEnabled: boolean;
  readonly whammyBar: GpifBendCurve;
  /** Whammy-bar vibrato (VibratoWTremBar). */
  readonly vibrato: boolean;
}

export interface GpifNote {
  readonly id: number;
  /** -1 when absent, like TuxGuitar. */
  readonly fret: number;
  readonly string: number;
  readonly tone: number;
  readonly octave: number;
  readonly element: number;
  readonly variation: number;
  readonly midiNumber: number;
  /** MIDI pitch of the trill note, 0 = no trill. */
  readonly trill: number;
  /** Trill speed in GP ticks (480 per quarter). */
  readonly trillDuration: number;
  readonly bendEnabled: boolean;
  readonly bend: GpifBendCurve;
  readonly hammer: boolean;
  readonly ghost: boolean;
  readonly slide: boolean;
  readonly slideFlags: number;
  readonly vibrato: boolean;
  readonly letRing: boolean;
  readonly accent: number;
  readonly tapped: boolean;
  readonly tieDestination: boolean;
  readonly muted: boolean;
  readonly palmMuted: boolean;
  /** -1 when absent. */
  readonly harmonicFret: number;
  /** '' when absent. */
  readonly harmonicType: string;
}

export interface GpifRhythm {
  readonly id: number;
  readonly noteValue: string | undefined;
  readonly augmentationDotCount: number;
  readonly primaryTupletNum: number;
  readonly primaryTupletDen: number;
}

export interface GpifDocument {
  readonly version: GpifVersion;
  /** `<GPVersion>` text, e.g. "8.1.4". */
  readonly gpVersion: string | undefined;
  /** `<GPRevision>` text, e.g. "13007". */
  readonly gpRevision: string | undefined;
  readonly score: GpifScore;
  readonly automations: readonly GpifAutomation[];
  readonly tracks: readonly GpifTrack[];
  readonly masterBars: readonly GpifMasterBar[];
  readonly bars: ReadonlyMap<number, GpifBar>;
  readonly voices: ReadonlyMap<number, GpifVoice>;
  readonly beats: ReadonlyMap<number, GpifBeat>;
  readonly notes: ReadonlyMap<number, GpifNote>;
  readonly rhythms: ReadonlyMap<number, GpifRhythm>;
}

/** Index items by id; the first item with a given id wins, as TuxGuitar's linear lookups do. */
export function indexById<T extends { readonly id: number }>(items: readonly T[]): ReadonlyMap<number, T> {
  const map = new Map<number, T>();
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return map;
}
