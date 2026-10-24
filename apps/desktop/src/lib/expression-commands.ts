import type { CommandMatch } from './command-search';
import { type Command, type CommandState, isRequirementMet } from './command-types';
import { EXPRESSION_KIND_NAMES, type ExpressionKind, type ExpressionMatch, searchExpressions } from './expression-text';

/** The command palette's Expression Text: what is typed after “>” (Tools ▸ Expression Text… opens the palette with it). */
export const EXPRESSION_PREFIX = '>';

/** Chords, octave signs and clefs are for pitched tracks: a drum track has none. */
const PITCHED_KINDS: ReadonlySet<ExpressionKind> = new Set<ExpressionKind>(['chord', 'octaveSign', 'clef']);

export function isExpressionQuery(query: string): boolean {
  return query.trimStart().startsWith(EXPRESSION_PREFIX);
}

/** The text after the “>”. */
export function expressionQuery(query: string): string {
  return query.trimStart().slice(EXPRESSION_PREFIX.length).trimStart();
}

/** A match as a row of the palette: run, it edits the score at the cursor (one undo step), as the palette's tools do. */
function expressionCommand(match: ExpressionMatch): Command {
  return {
    id: `expression.${match.id}`,
    title: match.title,
    group: EXPRESSION_KIND_NAMES[match.kind],
    keywords: [],
    isEnabled: (state) => isRequirementMet(match.scope, state) && !(PITCHED_KINDS.has(match.kind) && state.isPercussion),
    run: (actions) => actions.runCommand({ type: 'edit', edit: match.edit() }),
  };
}

/** The rows Expression Text lists for `query` (the text after “>”), best first. */
export function expressionCommands(query: string, state: CommandState): readonly Command[] {
  return searchExpressions(query, { palette: state.palette, tuning: state.tuning ?? [] }).map(expressionCommand);
}

/** The palette's rows for a query starting with “>”: the expressions, best first, those that cannot run now greyed. */
export function searchExpressionCommands(query: string, state: CommandState): readonly CommandMatch[] {
  return expressionCommands(expressionQuery(query), state).map((command) => ({ command, isEnabled: command.isEnabled(state), score: 0 }));
}
