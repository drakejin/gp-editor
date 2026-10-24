import type { Command, CommandState } from './command-types';
import { initials, isInitialsOnly, startsWithTyped } from './hangul';

/** A command the palette lists for what was typed. */
export interface CommandMatch {
  readonly command: Command;
  readonly isEnabled: boolean;
  /** How well it matches (higher is better); 0 for an empty query. */
  readonly score: number;
}

/** Recently run commands the palette remembers, newest first. */
export const MAX_RECENT_COMMANDS = 8;

/** Points for one typed word, by where it matched. */
const SCORES = {
  titleWord: 100,
  titlePrefix: 80,
  keyword: 70,
  keywordPrefix: 60,
  /** Initial consonants of a title word ("ㅌㄴ" → "튜너…"). */
  initialsPrefix: 50,
  groupPrefix: 40,
  titleSubstring: 30,
  /** Initial consonants in order anywhere in the title ("ㄴㅂㄱ" → "PDF로 내보내기…"). */
  initialsInOrder: 15,
  /** The letters in order anywhere in the title ("xpdf" → "Export PDF…"). */
  titleLetters: 10,
} as const;

/** Lower-case words of a text, Korean ones too: "Export PDF…" → ["export", "pdf"], "PDF로 내보내기…" → ["pdf로", "내보내기"]. */
export function searchWords(text: string): readonly string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9#♯♭+\uac00-\ud7a3\u3131-\u318e]+/)
    .filter((word) => word !== '');
}

function hasLettersInOrder(text: string, letters: string): boolean {
  let at = 0;
  for (const letter of text) {
    if (letter === letters[at]) {
      at += 1;
    }
  }
  return at === letters.length;
}

function tokenScore(token: string, command: Command): number {
  const title = searchWords(command.title);
  const keywords = command.keywords.flatMap(searchWords);
  const isInitials = isInitialsOnly(token);
  const checks: readonly (readonly [boolean, number])[] = [
    [title.includes(token), SCORES.titleWord],
    [title.some((word) => startsWithTyped(word, token)), SCORES.titlePrefix],
    [keywords.includes(token), SCORES.keyword],
    [keywords.some((word) => startsWithTyped(word, token)), SCORES.keywordPrefix],
    [isInitials && title.some((word) => initials(word).startsWith(token)), SCORES.initialsPrefix],
    [searchWords(command.group).some((word) => word.startsWith(token)), SCORES.groupPrefix],
    [title.some((word) => word.includes(token)), SCORES.titleSubstring],
    [isInitials && hasLettersInOrder(initials(title.join('')), token), SCORES.initialsInOrder],
    [hasLettersInOrder(title.join(''), token), SCORES.titleLetters],
  ];
  return checks.find(([isMatch]) => isMatch)?.[1] ?? 0;
}

/**
 * How well a command matches what was typed: every typed word must be found — a word of the title, the start of one, a
 * keyword, the initial consonants of a Korean word, the group, inside a title word, or its letters in order in the title
 * — and the points add up. Undefined
 * when a word is not found; 0 for an empty query.
 */
export function matchScore(command: Command, query: string): number | undefined {
  const scores = searchWords(query).map((token) => tokenScore(token, command));
  return scores.some((score) => score === 0) ? undefined : scores.reduce((sum, score) => sum + score, 0);
}

/**
 * The commands matching `query`, best first: the ones that can run before the others, then by score, then the recently
 * run ones (newest first), then in the registry's order — so with nothing typed, the recent commands come first.
 */
export function searchCommands(commands: readonly Command[], query: string, state: CommandState, recentIds: readonly string[]): readonly CommandMatch[] {
  const recentRank = (command: Command) => {
    const rank = recentIds.indexOf(command.id);
    return rank < 0 ? recentIds.length : rank;
  };
  const matches = commands.flatMap((command, order) => {
    const score = matchScore(command, query);
    return score === undefined ? [] : [{ command, isEnabled: command.isEnabled(state), score, order, recent: recentRank(command) }];
  });
  return matches
    .sort((a, b) => Number(b.isEnabled) - Number(a.isEnabled) || b.score - a.score || a.recent - b.recent || a.order - b.order)
    .map(({ command, isEnabled, score }) => ({ command, isEnabled, score }));
}

/** The recent commands after running `id`: it first, each once, at most MAX_RECENT_COMMANDS. */
export function rememberCommand(recentIds: readonly string[], id: string): readonly string[] {
  return [id, ...recentIds.filter((recent) => recent !== id)].slice(0, MAX_RECENT_COMMANDS);
}

/** The highlighted row after ↑ (-1) or ↓ (1), going round the list. */
export function moveHighlight(index: number, step: -1 | 1, count: number): number {
  return count === 0 ? 0 : (((index + step) % count) + count) % count;
}

/** The first and one-past-last rows to show of `count`, at most `size`, keeping `highlighted` in view near the middle. */
export function visibleRows(count: number, highlighted: number, size: number): { readonly start: number; readonly end: number } {
  const start = Math.max(0, Math.min(highlighted - Math.floor(size / 2), count - size));
  return { start, end: Math.min(count, start + size) };
}
