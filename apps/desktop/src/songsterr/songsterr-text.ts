/** Zero-width characters, the byte-order mark and the bidirectional marks, overrides and isolates: nothing to see, or what would reorder what is shown. */
const FORMAT_CHARACTERS = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
/** Control characters (line breaks and tabs are spaces by then). */
// eslint-disable-next-line no-control-regex -- the control characters are what it finds
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/** A surrogate without its pair (encodeURIComponent throws on one) becomes U+FFFD, as a decoder writes it. */
function wellFormed(text: string): string {
  return Array.from(text, (character) => (character.length === 1 && character >= '\uD800' && character <= '\uDFFF' ? '\uFFFD' : character)).join('');
}

/** A text as the panel shows or sends it: one space between words, no control or direction characters. */
export function cleanText(text: string): string {
  // Line breaks and tabs become spaces before the other control characters go.
  return wellFormed(text).replace(FORMAT_CHARACTERS, '').replace(/\s+/g, ' ').replace(CONTROL_CHARACTERS, '').replace(/ {2,}/g, ' ').trim();
}

/** At most `length` characters (a character outside the BMP counts once); a longer text ends in `ending`. */
export function capText(text: string, length: number, ending = ''): string {
  const characters = Array.from(text);
  return characters.length <= length ? text : `${characters.slice(0, length - ending.length).join('')}${ending}`.trim();
}
