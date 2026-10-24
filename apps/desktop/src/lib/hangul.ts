/**
 * Korean search helpers for the command palette: a title's initial consonants (초성, "ㅌㄴ" finds 튜너…) and a word
 * typed with the input method still composing its last syllable ("튠" or "조오" on the way to 튜너, 조옮김).
 */

const FIRST_SYLLABLE = 0xac00;
const LAST_SYLLABLE = 0xd7a3;
const MEDIAL_COUNT = 21;
const FINAL_COUNT = 28;

/** The 19 initial consonants in Unicode's order, as compatibility jamo (what the keyboard types alone). */
const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
/** The finals after "none", as compatibility jamo. */
const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
/** A compound vowel's first vowel (ㅘ is typed ㅗ then ㅏ), by medial index. */
const VOWEL_START: Readonly<Record<number, number>> = { 9: 8, 10: 8, 11: 8, 14: 13, 15: 13, 16: 13, 19: 18 };
/** A compound final's first consonant (ㄺ is typed ㄹ then ㄱ), by final index. */
const FINAL_START: Readonly<Record<number, number>> = { 3: 1, 5: 4, 6: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 8, 18: 17 };

interface Syllable {
  readonly initial: number;
  readonly medial: number;
  readonly final: number;
}

function decompose(character: string): Syllable | undefined {
  const code = character.codePointAt(0) ?? 0;
  if (code < FIRST_SYLLABLE || code > LAST_SYLLABLE) {
    return undefined;
  }
  const index = code - FIRST_SYLLABLE;
  return { initial: Math.floor(index / (MEDIAL_COUNT * FINAL_COUNT)), medial: Math.floor(index / FINAL_COUNT) % MEDIAL_COUNT, final: index % FINAL_COUNT };
}

/** A syllable's initial consonant ("튜" → "ㅌ"); any other character as it is. */
export function initialOf(character: string): string {
  const syllable = decompose(character);
  return syllable === undefined ? character : (INITIALS[syllable.initial] ?? character);
}

/** Every syllable of a text as its initial consonant: "조옮김…" → "ㅈㅇㄱ…". */
export function initials(text: string): string {
  return [...text].map(initialOf).join('');
}

/** Typed with initial consonants only ("ㅈㅇㄱ"): a 초성 search. */
export function isInitialsOnly(token: string): boolean {
  return token !== '' && [...token].every((character) => INITIALS.includes(character));
}

/** Whether the syllable being typed can still become `target`: its vowel and final may grow into compound ones. */
function canBecome(typed: Syllable, target: Syllable): boolean {
  if (typed.initial !== target.initial || (typed.medial !== target.medial && VOWEL_START[target.medial] !== typed.medial)) {
    return false;
  }
  return typed.final === 0 || (typed.medial === target.medial && (typed.final === target.final || FINAL_START[target.final] === typed.final));
}

/** Whether the final of the syllable being typed is the next syllable's initial ("튠" → 튜 + 너). */
function finalMovesOn(typed: Syllable, target: Syllable, next: string): boolean {
  const final = FINALS[typed.final] ?? '';
  return typed.initial === target.initial && typed.medial === target.medial && target.final === 0 && final !== '' && initialOf(next) === final;
}

/**
 * Whether `word` starts with what was typed, its last syllable perhaps still being composed by the input method:
 * "튠", "조오" and "조옮ㄱ" all start 튜너 and 조옮김 as they are typed.
 */
export function startsWithTyped(word: string, token: string): boolean {
  if (word.startsWith(token)) {
    return true;
  }
  const head = token.slice(0, -1);
  const last = token.slice(-1);
  if (last === '' || !word.startsWith(head)) {
    return false;
  }
  const target = word.charAt(head.length);
  if (INITIALS.includes(last)) {
    return initialOf(target) === last && target !== last;
  }
  const typed = decompose(last);
  const goal = decompose(target);
  if (typed === undefined || goal === undefined) {
    return false;
  }
  return canBecome(typed, goal) || finalMovesOn(typed, goal, word.charAt(head.length + 1));
}
