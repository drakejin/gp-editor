// Port of TuxGuitar app.tuxguitar.io.ptb.PTSongSynchronizerUtil (LGPL-2.1): plays each score's repeats, alternate endings
// and D.C. / D.S. / coda jumps out into a straight run of sections, as TuxGuitar does before it builds the song.
import { GpFormatError } from '../../errors';
import {
  PT_ACTIVE_SYMBOL,
  PT_DIRECTION,
  type PtBar,
  type PtComponent,
  type PtDirection,
  type PtPosition,
  type PtSection,
  type PtSong,
  type PtSymbol,
  type PtTrack,
  sortSection,
} from './ptb-model';

/**
 * What a score may play out: each component, position and section (with its staffs) counts. Repeats and jumps in a
 * corrupt file must not run, or pile up sections, without end.
 */
export const MAX_SYNCHRONIZED_COMPONENTS = 500_000;

/** PTIndex: section, position and component indexes. */
interface PtIndex {
  readonly s: number;
  readonly p: number;
  readonly c: number;
}

const SONG_START: PtIndex = { s: 0, p: 0, c: 0 };

/** What visiting a component asks for: go on, stop (Fine), or jump to an index. */
type Outcome = 'continue' | 'stop' | PtIndex;

/** A jump direction: whether it is used once only, where it goes, and which "al ..." symbol it then looks for. */
interface JumpRule {
  readonly isOnce: boolean;
  /** 'start', or the direction searched for. */
  readonly target: 'start' | number;
  /** The search stops at the jump's own position (segnos) instead of covering the whole score (codas). */
  readonly isBackward: boolean;
  readonly activeSymbol: number;
}

const { DC, DS, DSS, NONE } = PT_ACTIVE_SYMBOL;
const D = PT_DIRECTION;

function rule(target: 'start' | number, activeSymbol: number = NONE, isOnce = true): JumpRule {
  return { isOnce, target, isBackward: target === D.SEGNO || target === D.SEGNO_SEGNO, activeSymbol };
}

/** The directions jumps go to. */
const TARGET_DIRECTIONS: ReadonlySet<number> = new Set([D.SEGNO, D.SEGNO_SEGNO, D.CODA, D.DOUBLE_CODA]);

/** applyRepeats' chain of direction cases. */
const JUMPS: ReadonlyMap<number, JumpRule> = new Map([
  [D.DA_CAPO, rule('start')],
  [D.DAL_SEGNO, rule(D.SEGNO)],
  [D.DAL_SEGNO_SEGNO, rule(D.SEGNO_SEGNO)],
  [D.TO_CODA, rule(D.CODA)],
  [D.TO_DOUBLE_CODA, rule(D.DOUBLE_CODA)],
  [D.DA_CAPO_AL_CODA, rule('start', DC)],
  [D.DA_CAPO_AL_DOUBLE_CODA, rule('start', DC)],
  [D.DAL_SEGNO_AL_CODA, rule(D.SEGNO, DS)],
  [D.DAL_SEGNO_AL_DOUBLE_CODA, rule(D.SEGNO, DS)],
  [D.DAL_SEGNO_SEGNO_AL_CODA, rule(D.SEGNO_SEGNO, DSS)],
  [D.DAL_SEGNO_SEGNO_AL_DOUBLE_CODA, rule(D.SEGNO_SEGNO, DSS)],
  [D.DA_CAPO_AL_FINE, rule('start', DC)],
  // TuxGuitar does not mark these two as used: only the segno they find is.
  [D.DAL_SEGNO_AL_FINE, rule(D.SEGNO, DS, false)],
  [D.DAL_SEGNO_SEGNO_AL_FINE, rule(D.SEGNO_SEGNO, DSS, false)],
]);

/** PTSongSynchronizerUtil.synchronizeTracks. */
export function synchronizeSong(song: PtSong): PtSong {
  return { info: song.info, track1: synchronizeTrack(song.track1), track2: synchronizeTrack(song.track2) };
}

/**
 * Positions are sorted (PTSection.sort / PTPosition.sort) before anything is played; TuxGuitar sorts each section when
 * it first reaches it, which only differs when a jump searches a section it has not reached yet.
 */
function synchronizeTrack(track: PtTrack): PtTrack {
  const sorted: PtTrack = { infos: track.infos, sections: track.sections.map(sortSection) };
  return { infos: track.infos, sections: new Unroller(sorted).run() };
}

/** One section of the played-out score. */
interface UnrolledSection {
  readonly number: number;
  readonly staffs: number;
  readonly positions: { readonly position: number; readonly components: PtComponent[] }[];
}

/**
 * applyRepeats. TuxGuitar recurses at every jump and returns right after; here the jumps are a loop, so a long score cannot
 * overflow the stack.
 */
class Unroller {
  private readonly sections: UnrolledSection[] = [];
  private readonly used = new Set<PtDirection>();
  /** Where each segno and coda is, in score order, and how many of them a jump has used (they are used in order). */
  private readonly targets: ReadonlyMap<number, { readonly at: readonly PtIndex[]; used: number }>;
  /** PTSongSynchronizerData. */
  private repeatStart: PtIndex | undefined;
  private isRepeatInProgress = false;
  private repeatNumber = 0;
  private isRepeatAlternative = false;
  private isSkipping = false;
  private findActiveSymbol: number = NONE;
  private visited = 0;

  constructor(private readonly src: PtTrack) {
    this.targets = findTargets(src);
  }

  run(): readonly PtSection[] {
    let next: PtIndex | undefined = SONG_START;
    while (next !== undefined) {
      next = this.pass(next);
    }
    return this.sections;
  }

  /** One applyRepeats call: copies from `from` on; returns the jump target, or undefined at the end or at a Fine. */
  private pass(from: PtIndex): PtIndex | undefined {
    for (let s = from.s; s < this.src.sections.length; s++) {
      const section = this.src.sections[s];
      if (section === undefined) {
        continue;
      }
      this.spend(1 + section.staffs);
      const target: UnrolledSection = { number: section.number, staffs: section.staffs, positions: [] };
      this.sections.push(target);
      for (let p = s === from.s ? from.p : 0; p < section.positions.length; p++) {
        const outcome = this.passPosition(section.positions[p], target, { s, p, c: s === from.s && p === from.p ? from.c : 0 });
        if (outcome !== 'continue') {
          return outcome === 'stop' ? undefined : outcome;
        }
      }
    }
    return undefined;
  }

  private passPosition(position: PtPosition | undefined, section: UnrolledSection, from: PtIndex): Outcome {
    if (position === undefined) {
      return 'continue';
    }
    this.spend(1);
    const components: PtComponent[] = [];
    section.positions.push({ position: position.position, components });
    for (let c = from.c; c < position.components.length; c++) {
      const component = position.components[c];
      if (component === undefined) {
        continue;
      }
      this.spend(1);
      if (!this.isSkipping) {
        components.push(component);
      }
      const outcome = this.visit(component, { s: from.s, p: from.p, c });
      if (outcome !== 'continue') {
        return outcome;
      }
    }
    return 'continue';
  }

  private spend(cost: number): void {
    this.visited += cost;
    if (this.visited > MAX_SYNCHRONIZED_COMPONENTS) {
      throw new GpFormatError(`The repeats and jumps of the Power Tab score play more than ${MAX_SYNCHRONIZED_COMPONENTS} items`);
    }
  }

  private visit(component: PtComponent, at: PtIndex): Outcome {
    switch (component.kind) {
      case 'bar':
        return this.visitBar(component, at);
      case 'symbol':
        this.visitSymbol(component);
        return 'continue';
      case 'direction':
        return this.visitDirection(component, at);
      default:
        return 'continue';
    }
  }

  private visitBar(bar: PtBar, at: PtIndex): Outcome {
    if (bar.repeatClose > 0 && this.repeatStart !== undefined) {
      this.repeatNumber++;
      this.isRepeatInProgress = true;
      this.isRepeatAlternative = false;
      this.isSkipping = false;
      if (this.repeatNumber < bar.repeatClose) {
        return this.repeatStart;
      }
      this.repeatStart = undefined;
      this.repeatNumber = 0;
    }
    if (bar.repeatStart) {
      this.repeatStart = at;
      if (!this.isRepeatInProgress) {
        this.repeatNumber = 0;
      }
      this.isRepeatInProgress = false;
    }
    return 'continue';
  }

  /** An alternate ending: on a later pass, the bars of an ending that is not this pass's are skipped. */
  private visitSymbol(symbol: PtSymbol): void {
    this.isSkipping = false;
    if (!this.isRepeatAlternative && (symbol.endNumber & 1) !== 0) {
      const isValidEnding = (symbol.endNumber & (1 << this.repeatNumber)) !== 0;
      if (this.repeatNumber > 0 && !isValidEnding) {
        this.isSkipping = true;
      }
      this.isRepeatAlternative = true;
    }
  }

  private visitDirection(direction: PtDirection, at: PtIndex): Outcome {
    const isValidRepeat = direction.repeat === 0 || (this.repeatStart !== undefined && this.repeatNumber + 1 === direction.repeat);
    if (direction.activeSymbol !== this.findActiveSymbol || !isValidRepeat) {
      return 'continue';
    }
    this.findActiveSymbol = NONE;
    if (direction.direction === D.FINE) {
      return this.canUseDirection(direction) ? 'stop' : 'continue';
    }
    const jump = JUMPS.get(direction.direction);
    if (jump === undefined || (jump.isOnce && !this.canUseDirection(direction))) {
      return 'continue';
    }
    const target = jump.target === 'start' ? SONG_START : this.findUnusedDirection(jump.target, jump.isBackward ? at : undefined);
    if (target === undefined) {
      return 'continue';
    }
    this.findActiveSymbol = jump.activeSymbol;
    return target;
  }

  /** canUseDirection: true (and the direction is marked used) the first time only. */
  private canUseDirection(direction: PtDirection): boolean {
    if (this.used.has(direction)) {
      return false;
    }
    this.used.add(direction);
    return true;
  }

  /**
   * findUnusedDirection: the first unused `value` direction up to `end` (inclusive), else in the whole score. Only jumps
   * use segnos and codas, first to last, so the first unused one is the next in score order.
   */
  private findUnusedDirection(value: number, end: PtIndex | undefined): PtIndex | undefined {
    const targets = this.targets.get(value);
    const next = targets?.at[targets.used];
    if (targets === undefined || next === undefined || (end !== undefined && (next.s > end.s || (next.s === end.s && next.p > end.p)))) {
      return undefined;
    }
    targets.used++;
    return next;
  }
}

/** Every segno and coda of the score, by direction, in score order. */
function findTargets(track: PtTrack): ReadonlyMap<number, { readonly at: readonly PtIndex[]; used: number }> {
  const targets = new Map<number, { readonly at: PtIndex[]; used: number }>();
  track.sections.forEach((section, s) => {
    section.positions.forEach((position, p) => {
      for (const component of position.components) {
        if (component.kind === 'direction' && TARGET_DIRECTIONS.has(component.direction)) {
          const entry = targets.get(component.direction) ?? { at: [], used: 0 };
          entry.at.push({ s, p, c: 0 });
          targets.set(component.direction, entry);
        }
      }
    });
  });
  return targets;
}
