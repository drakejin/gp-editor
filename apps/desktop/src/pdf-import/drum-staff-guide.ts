// i18n-exempt-file: the drum part of the prompt sent to Claude (never shown)
import { type DrumNotehead, GM_DRUM_KEYS, drumNotation, gmPercussionName } from '@gp-editor/core';

/**
 * The drums a drum set's staff writes, as Guitar Pro's kit places them: the app draws the imported drums by the same
 * table (gp-core `drumNotation`), so a drum read from its place on the page is drawn back in that place.
 */
const GUIDE_KEYS: readonly number[] = [
  GM_DRUM_KEYS.china,
  GM_DRUM_KEYS.crash1,
  GM_DRUM_KEYS.splash,
  GM_DRUM_KEYS.closedHiHat,
  GM_DRUM_KEYS.openHiHat,
  GM_DRUM_KEYS.ride,
  GM_DRUM_KEYS.rideBell,
  GM_DRUM_KEYS.cowbell,
  GM_DRUM_KEYS.highTom,
  GM_DRUM_KEYS.hiMidTom,
  GM_DRUM_KEYS.snare,
  GM_DRUM_KEYS.sideStick,
  GM_DRUM_KEYS.tambourine,
  GM_DRUM_KEYS.lowMidTom,
  GM_DRUM_KEYS.lowTom,
  GM_DRUM_KEYS.highFloorTom,
  GM_DRUM_KEYS.bassDrum,
  GM_DRUM_KEYS.acousticBassDrum,
  GM_DRUM_KEYS.pedalHiHat,
];

const NOTEHEAD_WORDS: Readonly<Partial<Record<DrumNotehead, string>>> = {
  noteheadBlack: 'round',
  noteheadXBlack: 'x',
  noteheadHeavyX: 'x',
  noteheadHeavyXHat: 'x',
  noteheadCircleX: 'circled x',
  noteheadDiamondWhite: 'diamond',
  noteheadTriangleUpBlack: 'triangle',
};

/** Staff positions (0 = the bottom line, 8 = the top line) by name. */
const STAFF_PLACES: ReadonlyMap<number, string> = new Map([
  [11, 'space above the first ledger line'],
  [10, 'first ledger line above'],
  [9, 'space above the staff'],
  [8, 'top line'],
  [7, 'top space'],
  [6, 'fourth line'],
  [5, 'third space'],
  [4, 'middle line'],
  [3, 'second space'],
  [2, 'second line'],
  [1, 'first space'],
  [0, 'bottom line'],
  [-1, 'space below the staff'],
]);

const LETTERS = 'CDEFGAB';
/** E4, the treble staff's bottom line, in diatonic steps (octave × 7 + letter). */
const BOTTOM_LINE_STEP = 30;
const STEPS_PER_OCTAVE = 7;

/** The place's note on a treble staff, as drum staves are usually read ("F4"). */
function placeNote(position: number): string {
  const step = BOTTOM_LINE_STEP + position;
  return `${LETTERS.charAt(step % STEPS_PER_OCTAVE)}${Math.floor(step / STEPS_PER_OCTAVE)}`;
}

function guideLine(key: number): string | undefined {
  const notation = drumNotation(key);
  const name = gmPercussionName(key);
  const place = notation === undefined ? undefined : STAFF_PLACES.get(notation.position);
  if (notation === undefined || name === undefined || place === undefined) {
    return undefined;
  }
  const notehead = NOTEHEAD_WORDS[notation.noteheads.black] ?? 'notehead';
  return `  - ${placeNote(notation.position)} (${place}), ${notehead}: ${name}`;
}

/** One line per drum, top of the staff first: where it is written, its notehead, and the drum's General MIDI name. */
export function drumStaffGuide(): readonly string[] {
  return GUIDE_KEYS.flatMap((key) => guideLine(key) ?? []);
}
