// Guitar Pro 7's factory drum kit (no TuxGuitar counterpart): the <InstrumentSet> Guitar Pro writes into a drum track.
// Element and articulation names, staff lines, noteheads and MIDI numbers as the GP7 test fixtures' drum tracks hold them.
// The .gp writer writes it (write/gpif/drum-kit.ts); the score writes drums by it (drum-notation.ts).

/** [name, staff line, noteheads (index into NOTEHEADS), technique placement, technique symbol, input MIDI, RSE sound, output MIDI]. */
type ArticulationRow = readonly [string, number, number, string, string, number, string, number];
/** [name, type, sound bank name, articulations]. */
type ElementRow = readonly [string, string, string, readonly ArticulationRow[]];

/** Notehead triples (black, half, whole) as Guitar Pro names them. */
const NOTEHEADS: readonly string[] = [
  'noteheadBlack noteheadHalf noteheadWhole',
  'noteheadXBlack noteheadXBlack noteheadXBlack',
  'noteheadDiamondWhite noteheadDiamondWhite noteheadDiamondWhite',
  'noteheadCircleSlash noteheadCircleSlash noteheadCircleSlash',
  'noteheadCircleX noteheadCircleX noteheadCircleX',
  'noteheadHeavyXHat noteheadHeavyXHat noteheadHeavyXHat',
  'noteheadHeavyX noteheadHeavyX noteheadHeavyX',
  'noteheadTriangleUpBlack noteheadTriangleUpHalf noteheadTriangleUpWhole',
  'noteheadXBlack noteheadXHalf noteheadXWhole',
  'noteheadTriangleUpBlack noteheadTriangleUpBlack noteheadTriangleUpBlack',
  'noteheadNull noteheadNull noteheadNull',
  'noteheadSlashedBlack2 noteheadSlashedBlack2 noteheadSlashedBlack2',
  'noteheadBlack noteheadBlack noteheadBlack',
];

const FACTORY_KIT: readonly ElementRow[] = [
  ['Snare', 'snare', 'Master-Snare', [
    ['Snare (hit)', 3, 0, 'outside', '', 38, 'stick.hit.hit', 38],
    ['Snare (side stick)', 3, 1, 'outside', '', 37, 'stick.hit.sidestick', 37],
    ['Snare (rim shot)', 3, 2, 'outside', '', 91, 'stick.hit.rimshot', 38]]],
  ['Charley', 'hiHat', 'Master-Hihat', [
    ['Hi-Hat (closed)', -1, 1, 'outside', '', 42, 'stick.hit.closed', 42],
    ['Hi-Hat (half)', -1, 3, 'outside', '', 92, 'stick.hit.half', 46],
    ['Hi-Hat (open)', -1, 4, 'outside', '', 46, 'stick.hit.open', 46],
    ['Pedal Hi-Hat (hit)', 9, 1, 'outside', '', 44, 'pedal.hit.pedal', 44]]],
  ['Acoustic Kick Drum', 'kickDrum', 'AcousticKick-Percu', [
    ['Kick (hit)', 8, 0, 'outside', '', 35, 'pedal.hit.hit', 35]]],
  ['Kick Drum', 'kickDrum', 'Master-Kick', [
    ['Kick (hit)', 7, 0, 'outside', '', 36, 'pedal.hit.hit', 36]]],
  ['Tom Very High', 'tom', 'Master-Tom05', [
    ['High Floor Tom (hit)', 1, 0, 'outside', '', 50, 'stick.hit.hit', 50]]],
  ['Tom High', 'tom', 'Master-Tom04', [
    ['High Tom (hit)', 2, 0, 'outside', '', 48, 'stick.hit.hit', 48]]],
  ['Tom Medium', 'tom', 'Master-Tom03', [
    ['Mid Tom (hit)', 4, 0, 'outside', '', 47, 'stick.hit.hit', 47]]],
  ['Tom Low', 'tom', 'Master-Tom02', [
    ['Low Tom (hit)', 5, 0, 'outside', '', 45, 'stick.hit.hit', 45]]],
  ['Tom Very Low', 'tom', 'Master-Tom01', [
    ['Very Low Tom (hit)', 6, 0, 'outside', '', 43, 'stick.hit.hit', 43]]],
  ['Ride', 'ride', 'Master-Ride', [
    ['Ride (edge)', 0, 1, 'above', 'pictEdgeOfCymbal', 93, 'stick.hit.edge', 51],
    ['Ride (middle)', 0, 1, 'outside', '', 51, 'stick.hit.mid', 51],
    ['Ride (bell)', 0, 2, 'outside', '', 53, 'stick.hit.bell', 53],
    ['Ride (choke)', 0, 1, 'outside', 'articStaccatoAbove', 94, 'stick.hit.choke', 51]]],
  ['Splash', 'splash', 'Master-Splash', [
    ['Splash (hit)', -2, 1, 'outside', '', 55, 'stick.hit.hit', 55],
    ['Splash (choke)', -2, 1, 'outside', 'articStaccatoAbove', 95, 'stick.hit.choke', 55]]],
  ['China', 'china', 'Master-China', [
    ['China (hit)', -3, 5, 'outside', '', 52, 'stick.hit.hit', 52],
    ['China (choke)', -3, 5, 'outside', '', 96, 'stick.hit.choke', 52]]],
  ['Crash High', 'crash', 'Master-Crash02', [
    ['Crash high (hit)', -2, 6, 'outside', '', 49, 'stick.hit.hit', 49],
    ['Crash high (choke)', -2, 6, 'outside', 'articStaccatoAbove', 97, 'stick.hit.choke', 49]]],
  ['Crash Medium', 'crash', 'Master-Crash01', [
    ['Crash medium (hit)', -1, 6, 'outside', '', 57, 'stick.hit.hit', 57],
    ['Crash medium (choke)', -1, 6, 'outside', 'articStaccatoAbove', 98, 'stick.hit.choke', 57]]],
  ['Cowbell Low', 'cowbell', 'CowbellBig-Percu', [
    ['Cowbell low (hit)', 1, 7, 'outside', '', 99, 'stick.hit.hit', 56],
    ['Cowbell low (tip)', 1, 8, 'outside', '', 100, 'stick.hit.tip', 56]]],
  ['Cowbell Medium', 'cowbell', 'CowbellMid-Percu', [
    ['Cowbell medium (hit)', 0, 7, 'outside', '', 56, 'stick.hit.hit', 56],
    ['Cowbell medium (tip)', 0, 8, 'outside', '', 101, 'stick.hit.tip', 56]]],
  ['Cowbell High', 'cowbell', 'CowbellSmall-Percu', [
    ['Cowbell high (hit)', -1, 7, 'outside', '', 102, 'stick.hit.hit', 56],
    ['Cowbell high (tip)', -1, 8, 'outside', '', 103, 'stick.hit.tip', 56]]],
  ['Woodblock Low', 'woodblock', 'WoodblockLow-Percu', [
    ['Woodblock low (hit)', -9, 9, 'outside', '', 77, 'stick.hit.hit', 77]]],
  ['Woodblock High', 'woodblock', 'WoodblockHigh-Percu', [
    ['Woodblock high (hit)', -10, 9, 'outside', '', 76, 'stick.hit.hit', 76]]],
  ['Bongo High', 'bongo', 'BongoHigh-Percu', [
    ['Bongo High (hit)', -4, 0, 'outside', '', 60, 'hand.hit.hit', 60],
    ['Bongo High (mute)', -5, 0, 'inside', 'noteheadParenthesis', 104, 'hand.hit.mute', 60],
    ['Bongo High (slap)', -6, 1, 'outside', '', 105, 'hand.hit.slap', 60]]],
  ['Bongo Low', 'bongo', 'BongoLow-Percu', [
    ['Bongo Low (hit)', -7, 0, 'outside', '', 61, 'hand.hit.hit', 61],
    ['Bongo Low (mute)', -8, 0, 'inside', 'noteheadParenthesis', 106, 'hand.hit.mute', 61],
    ['Bongo Low (slap)', -16, 1, 'outside', '', 107, 'hand.hit.slap', 61]]],
  ['Timbale Low', 'timbale', 'TimbaleLow-Percu', [
    ['Timbale low (hit)', 10, 0, 'outside', '', 66, 'stick.hit.hit', 66]]],
  ['Timbale High', 'timbale', 'TimbaleHigh-Percu', [
    ['Timbale high (hit)', 9, 0, 'outside', '', 65, 'stick.hit.hit', 65]]],
  ['Agogo Low', 'agogo', 'AgogoLow-Percu', [
    ['Agogo low (hit)', 12, 0, 'outside', '', 68, 'stick.hit.hit', 68]]],
  ['Agogo High', 'agogo', 'AgogoHigh-Percu', [
    ['Agogo high (hit)', 11, 0, 'outside', '', 67, 'stick.hit.hit', 67]]],
  ['Conga Low', 'conga', 'CongaLow-Percu', [
    ['Conga low (hit)', 17, 0, 'outside', '', 64, 'hand.hit.hit', 64],
    ['Conga low (slap)', 16, 1, 'outside', '', 108, 'hand.hit.slap', 64],
    ['Conga low (mute)', 15, 0, 'inside', 'noteheadParenthesis', 109, 'hand.hit.mute', 64]]],
  ['Conga High', 'conga', 'CongaHigh-Percu', [
    ['Conga high (hit)', 14, 0, 'outside', '', 63, 'hand.hit.hit', 63],
    ['Conga high (slap)', 13, 1, 'outside', '', 110, 'hand.hit.slap', 63],
    ['Conga high (mute)', 19, 0, 'inside', 'noteheadParenthesis', 62, 'hand.hit.mute', 62]]],
  ['Whistle Low', 'whistle', 'WhistleLow-Percu', [
    ['Whistle low (hit)', -11, 0, 'outside', '', 72, 'blow.hit.hit', 72]]],
  ['Whistle High', 'whistle', 'WhistleHigh-Percu', [
    ['Whistle high (hit)', -17, 0, 'outside', '', 71, 'blow.hit.hit', 71]]],
  ['Guiro', 'guiro', 'Guiro-Percu', [
    ['Guiro (hit)', 38, 0, 'outside', '', 73, 'stick.hit.hit', 73],
    ['Guiro (scrap-return)', 37, 0, 'outside', '', 74, 'stick.scrape.return', 74]]],
  ['Surdo', 'surdo', 'Surdo-Percu', [
    ['Surdo (hit)', 36, 0, 'outside', '', 86, 'brush.hit.hit', 86],
    ['Surdo (mute)', 35, 1, 'inside', 'noteheadParenthesis', 87, 'brush.hit.mute', 87]]],
  ['Tambourine', 'tambourine', 'Tambourine-Percu', [
    ['Tambourine (hit)', 3, 9, 'outside', '', 54, 'hand.hit.hit', 54],
    ['Tambourine (return)', 2, 9, 'above', 'stringsUpBow', 111, 'hand.hit.return', 54],
    ['Tambourine (roll)', 1, 9, 'above', 'stringsDownBow', 112, 'hand.hit.roll', 54],
    ['Tambourine (hand)', -7, 1, 'outside', '', 113, 'hand.hit.handhit', 54]]],
  ['Cuica', 'cuica', 'Cuica-Percu', [
    ['Cuica (open)', 30, 0, 'outside', '', 79, 'hand.hit.hit', 79],
    ['Cuica (mute)', 29, 1, 'outside', '', 78, 'hand.hit.mute', 78]]],
  ['Vibraslap', 'vibraslap', 'Vibraslap-Percu', [
    ['Vibraslap (hit)', 28, 0, 'outside', '', 58, 'hand.hit.hit', 58]]],
  ['Triangle', 'triangle', 'Triangle-Percu', [
    ['Triangle (hit)', 27, 0, 'outside', '', 81, 'stick.hit.hit', 81],
    ['Triangle (mute)', 26, 1, 'inside', 'noteheadParenthesis', 80, 'stick.hit.mute', 80]]],
  ['Grancassa', 'grancassa', 'Grancassa-Percu', [
    ['Grancassa (hit)', 25, 0, 'outside', '', 114, 'mallet.hit.hit', 43]]],
  ['Piatti', 'piatti', 'Piatti-Percu', [
    ['Piatti (hit)', 18, 0, 'outside', '', 115, 'hand.hit.hit', 49],
    ['Piatti (hand)', 24, 1, 'outside', '', 116, 'hand.hit.hit', 49]]],
  ['Cabasa', 'cabasa', 'Cabasa-Percu', [
    ['Cabasa (hit)', 23, 0, 'outside', '', 69, 'hand.hit.hit', 69],
    ['Cabasa (return)', 22, 0, 'outside', 'stringsUpBow', 117, 'hand.hit.return', 69]]],
  ['Castanets', 'castanets', 'Castanets-Percu', [
    ['Castanets (hit)', 21, 0, 'outside', '', 85, 'hand.hit.hit', 85]]],
  ['Claves', 'claves', 'Claves-Percu', [
    ['Claves (hit)', 20, 0, 'outside', '', 75, 'stick.hit.hit', 75]]],
  ['Left Maraca', 'maraca', 'Maracas-Percu', [
    ['Left Maraca (hit)', -12, 0, 'outside', '', 70, 'hand.hit.hit', 70],
    ['Left Maraca (return)', -13, 0, 'outside', 'stringsUpBow', 118, 'hand.hit.return', 70]]],
  ['Right Maraca', 'maraca', 'Maracas-Percu', [
    ['Right Maraca (hit)', -14, 0, 'outside', '', 119, 'hand.hit.hit', 70],
    ['Right Maraca (return)', -15, 0, 'outside', 'stringsUpBow', 120, 'hand.hit.return', 70]]],
  ['Shaker', 'shaker', 'ShakerStudio-Percu', [
    ['Shaker (hit)', -23, 0, 'outside', '', 82, 'hand.hit.hit', 82],
    ['Shaker (return)', -24, 0, 'outside', 'stringsUpBow', 122, 'hand.hit.return', 82]]],
  ['Bell Tree', 'bellTree', 'BellTree-Percu', [
    ['Bell Tree (hit)', -18, 0, 'outside', '', 84, 'stick.hit.hit', 53],
    ['Bell Tree (return)', -19, 0, 'outside', 'stringsUpBow', 123, 'stick.hit.return', 53]]],
  ['Jingle Bell', 'jingleBell', 'JingleBell-Percu', [
    ['Jingle Bell (hit)', -20, 0, 'outside', '', 83, 'stick.hit.hit', 53]]],
  ['Tinkle Bell', 'jingleBell', 'JingleBell-Percu', [
    ['Tinkle Bell (hit)', -20, 0, 'outside', '', 83, 'stick.hit.hit', 53]]],
  ['Golpe', 'unpitched', 'Golpe-Percu', [
    ['Golpe (thumb)', -21, 10, 'below', 'guitarGolpe', 124, 'thumb.hit.body', 62],
    ['Golpe (finger)', -22, 10, 'above', 'guitarGolpe', 125, 'finger4.hit.body', 62]]],
  ['Hand Clap', 'handClap', 'GroupHandClap-Percu', [
    ['Hand Clap (hit)', 3, 0, 'outside', '', 39, 'hand.hit.hit', 39]]],
  ['Electric Snare', 'snare', 'ElectricSnare-Percu', [
    ['Electric Snare (hit)', 3, 0, 'outside', '', 40, 'stick.hit.hit', 40]]],
  ['Sticks', 'snare', 'Stick-Percu', [
    ['Snare (side stick)', 3, 11, 'outside', '', 31, 'stick.hit.sidestick', 40]]],
  ['Very Low Floor Tom', 'tom', 'LowFloorTom-Percu', [
    ['Low Floor Tom (hit)', 5, 0, 'outside', '', 41, 'stick.hit.hit', 41]]],
  ['Ride Cymbal 2', 'ride', 'Ride-Percu', [
    ['Ride (edge)', 2, 1, 'above', 'pictEdgeOfCymbal', 59, 'stick.hit.edge', 59],
    ['Ride (middle)', 2, 1, 'outside', '', 126, 'stick.hit.mid', 59],
    ['Ride (bell)', 2, 2, 'outside', '', 127, 'stick.hit.bell', 59],
    ['Ride (choke)', 2, 1, 'outside', 'articStaccatoAbove', 29, 'stick.hit.choke', 59]]],
  ['Reverse Cymbal', 'crash', 'Reverse-Cymbal', [
    ['Reverse Cymbal (hit)', -3, 1, 'outside', '', 30, 'stick.hit.hit', 49]]],
  ['Metronome', 'snare', 'Metronome-Percu', [
    ['Metronome (hit)', 3, 1, 'outside', '', 33, 'stick.hit.sidestick', 37],
    ['Metronome (bell)', 3, 12, 'outside', '', 34, 'stick.hit.hit', 38]]],
];

export interface DrumArticulation {
  readonly name: string;
  /** Guitar Pro's staff line: 0 = the top line, counting lines and spaces downwards. */
  readonly staffLine: number;
  /** The black, half and whole noteheads' SMuFL names, space-separated (GPIF's `<Noteheads>`). */
  readonly noteheads: string;
  readonly techniquePlacement: string;
  readonly techniqueSymbol: string;
  /** The MIDI number a drum note carries (its Fret and Midi): Guitar Pro's articulation id. */
  readonly inputMidi: number;
  readonly outputRseSound: string;
  /** The General MIDI percussion note played. */
  readonly outputMidi: number;
}

export interface DrumElement {
  readonly name: string;
  readonly type: string;
  readonly soundbankName: string;
  readonly articulations: readonly DrumArticulation[];
}

const DEFAULT_NOTEHEADS = 0;

/** The noteheads of a plain drum: a black, half or whole notehead. */
export const DEFAULT_DRUM_NOTEHEADS: string = NOTEHEADS[DEFAULT_NOTEHEADS] ?? '';

function articulationOf([name, staffLine, noteheads, placement, symbol, inputMidi, rseSound, outputMidi]: ArticulationRow): DrumArticulation {
  return {
    name,
    staffLine,
    noteheads: NOTEHEADS[noteheads] ?? DEFAULT_DRUM_NOTEHEADS,
    techniquePlacement: placement,
    techniqueSymbol: symbol,
    inputMidi,
    outputRseSound: rseSound,
    outputMidi,
  };
}

/** Guitar Pro 7's factory drum kit, its elements in Guitar Pro's order. */
export const FACTORY_DRUM_KIT: readonly DrumElement[] = FACTORY_KIT.map(([name, type, soundbankName, rows]) => ({
  name,
  type,
  soundbankName,
  articulations: rows.map(articulationOf),
}));
