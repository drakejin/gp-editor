/** Control characters and the bidirectional marks, overrides and isolates, which would reorder what is shown. */
// eslint-disable-next-line no-control-regex -- the control characters are what it finds
const HIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** A text as the panel shows or sends it: one space between words, no control or direction characters. */
export function cleanText(text: string): string {
  // Line breaks and tabs become spaces before the other control characters go.
  return text.replace(/\s+/g, ' ').replace(HIDDEN_CHARACTERS, '').replace(/ {2,}/g, ' ').trim();
}

/** At most `length` characters (a character outside the BMP counts once); a longer text ends in `ending`. */
export function capText(text: string, length: number, ending = ''): string {
  const characters = Array.from(text);
  return characters.length <= length ? text : `${characters.slice(0, length - ending.length).join('')}${ending}`.trim();
}
