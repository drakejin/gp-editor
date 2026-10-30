// i18n-exempt-file: the score's text lengths for Claude's prompt, never shown
import { type Span, spansWithin } from './score-summary';

/** A track's line in a bar: its index and what it plays. */
export interface TrackLine {
  readonly trackIndex: number;
  readonly text: string;
}

/** What a window's text length needs of the score: each bar's track lines and its heading's length. */
export interface BarSource {
  readonly lines: (measureIndex: number) => readonly TrackLine[];
  readonly headingLength: (measureIndex: number, isBlockStart: boolean) => number;
}

/** A bar where no track plays: its heading and this. */
export const ALL_REST = ' (all rest)';

/** Where a track line is first written out in the window, and how often it comes. */
interface LineUse {
  readonly trackIndex: number;
  /** "3: …" written out. */
  readonly full: number;
  readonly first: number;
  readonly count: number;
}

/** "3: =17": a line playing what bar 17 plays. */
function referenceLength(trackIndex: number, firstIndex: number): number {
  return `${trackIndex}: =${firstIndex + 1}`.length;
}

function lineKey(line: TrackLine): string {
  return `${line.trackIndex}:${line.text}`;
}

/**
 * The text length of the bars written out from `first` to `last`, as the score text writes them (a heading per bar, the
 * first one in full; a line per track that plays, "=N" for a line written out earlier in these bars; a separator after
 * each bar), kept as bars join the window before or after it. A join costs what it adds — worked out from the lines it
 * brings and the lines they turn into references —, never by writing the window again.
 */
export class DetailLength {
  private firstIndex: number;
  private lastIndex: number;
  private total = 0;
  private readonly uses = new Map<string, LineUse>();

  constructor(
    private readonly source: BarSource,
    index: number,
  ) {
    this.firstIndex = index;
    this.lastIndex = index;
    this.total = this.barLength(index, true) + this.source.lines(index).reduce((sum, line) => sum + this.fullLength(line), 0);
    this.source.lines(index).forEach((line) => this.uses.set(lineKey(line), { trackIndex: line.trackIndex, full: this.fullLength(line), first: index, count: 1 }));
  }

  get first(): number {
    return this.firstIndex;
  }

  get last(): number {
    return this.lastIndex;
  }

  length(): number {
    return this.total;
  }

  /** What adding the bar after the window costs. */
  costAfter(): number {
    const index = this.lastIndex + 1;
    return this.barLength(index, false) + this.source.lines(index).reduce((sum, line) => {
      const use = this.uses.get(lineKey(line));
      return sum + (use === undefined ? this.fullLength(line) : referenceLength(line.trackIndex, use.first));
    }, 0);
  }

  addAfter(): void {
    this.total += this.costAfter();
    this.lastIndex += 1;
    this.source.lines(this.lastIndex).forEach((line) => {
      const use = this.uses.get(lineKey(line));
      this.uses.set(lineKey(line), use === undefined ? { trackIndex: line.trackIndex, full: this.fullLength(line), first: this.lastIndex, count: 1 } : { ...use, count: use.count + 1 });
    });
  }

  /** What adding the bar before the window costs: its lines written out turn later ones into references to it. */
  costBefore(): number {
    const index = this.firstIndex - 1;
    const heading = this.barLength(index, true) + this.source.headingLength(this.firstIndex, false) - this.source.headingLength(this.firstIndex, true);
    return heading + this.source.lines(index).reduce((sum, line) => {
      const use = this.uses.get(lineKey(line));
      return sum + (use === undefined ? this.fullLength(line) : use.count * referenceLength(line.trackIndex, index) - (use.count - 1) * referenceLength(line.trackIndex, use.first));
    }, 0);
  }

  addBefore(): void {
    this.total += this.costBefore();
    this.firstIndex -= 1;
    this.source.lines(this.firstIndex).forEach((line) => {
      const use = this.uses.get(lineKey(line));
      this.uses.set(lineKey(line), { trackIndex: line.trackIndex, full: this.fullLength(line), first: this.firstIndex, count: (use?.count ?? 0) + 1 });
    });
  }

  /** A bar's heading, its line breaks (or "(all rest)") and the separator after it — all but its lines' own text. */
  private barLength(index: number, isBlockStart: boolean): number {
    const lineCount = this.source.lines(index).length;
    return this.source.headingLength(index, isBlockStart) + (lineCount === 0 ? ALL_REST.length : lineCount) + 1;
  }

  private fullLength(line: TrackLine): number {
    return `${line.trackIndex}: `.length + line.text.length;
  }
}

/** The summary lines of stretches of bars on one grid, each written once, and their lengths with a separator each. */
export class SummaryLengths {
  private readonly written = new Map<string, string>();

  constructor(
    private readonly grid: readonly Span[],
    private readonly write: (span: Span) => string,
  ) {}

  lines(first: number, last: number): readonly string[] {
    return last < first ? [] : spansWithin(this.grid, first, last).map((span) => this.line(span));
  }

  length(first: number, last: number): number {
    return this.lines(first, last).reduce((sum, line) => sum + line.length + 1, 0);
  }

  private line(span: Span): string {
    const key = `${span[0]}-${span[1]}`;
    const kept = this.written.get(key);
    if (kept !== undefined) {
      return kept;
    }
    const line = this.write(span);
    this.written.set(key, line);
    return line;
  }
}
