// Adding one array's items to another, for the arrays renderMidi builds up (events, bytes).

/**
 * Pushes `items` onto the end of `target` one by one: `target.push(...items)` copies `items` into an argument list
 * (Hermes runs it through array helpers) and fails on very long arrays.
 */
export function appendAll<T>(target: T[], items: readonly T[]): void {
  for (const item of items) {
    target.push(item);
  }
}
