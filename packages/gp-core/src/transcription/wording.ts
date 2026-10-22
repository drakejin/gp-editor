/** "1 note", "2 notes": a count with its noun, for messages shown to the user. */
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
