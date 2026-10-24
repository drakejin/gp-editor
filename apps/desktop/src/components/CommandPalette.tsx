import { useMemo, useState } from 'react';
import { type KeyEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { type Translate, useLanguage, useT } from '../hooks/use-i18n';
import { type CommandMatch, moveHighlight, searchCommands, visibleRows } from '../lib/command-search';
import type { Command, CommandState } from '../lib/command-types';
import { expressionQuery, isExpressionQuery, searchExpressionCommands } from '../lib/expression-commands';
import { KEYS } from '../lib/key-commands';
import type { Palette } from '../theme';
import { TextField } from './TextField';

interface CommandPaletteProps {
  readonly palette: Palette;
  readonly commands: readonly Command[];
  readonly state: CommandState;
  /** Commands run from the palette, newest first. */
  readonly recentIds: readonly string[];
  readonly onRun: (command: Command) => void;
  /** A click outside; Esc reaches the window, which closes the palette like any panel. */
  readonly onClose: () => void;
  /** What the field starts with: “>” opens Expression Text (Tools ▸ Expression Text…). */
  readonly initialQuery?: string;
}

/** Rows shown at once; ↑ and ↓ move the window along the list. */
const VISIBLE_ROWS = 12;
/**
 * Keys the list takes from the field: ↑ and ↓ move the highlighted row, ↩ runs it. The field is a multi-line one kept to
 * one line, because only that kind hands every key to JS on react-native-macos (a single-line field keeps the arrows).
 */
const LIST_KEYS = [{ key: KEYS.arrowUp }, { key: KEYS.arrowDown }, { key: KEYS.enter }];

interface CommandRowProps {
  readonly palette: Palette;
  readonly match: CommandMatch;
  readonly isHighlighted: boolean;
  readonly onRun: (command: Command) => void;
}

function CommandRow({ palette, match, isHighlighted, onRun }: CommandRowProps) {
  const { command, isEnabled } = match;
  return (
    <Pressable
      // i18n-exempt: a test id
      testID={`command-${command.id}`}
      disabled={!isEnabled}
      onPress={() => onRun(command)}
      style={[styles.row, isHighlighted ? { backgroundColor: palette.chromeAccent } : null, isEnabled ? null : styles.disabled]}
    >
      <Text style={[styles.title, { color: isHighlighted ? palette.chromeAccentText : palette.chromeText }]} numberOfLines={1}>
        {command.title}
      </Text>
      <Text style={[styles.group, { color: isHighlighted ? palette.chromeAccentText : palette.chromeMuted }]}>{command.group}</Text>
      {command.shortcut === undefined ? null : (
        <Text style={[styles.keyCap, { color: palette.chromeText, backgroundColor: palette.chromeRaised, borderColor: palette.chromeBorder }]}>{command.shortcut}</Text>
      )}
    </Pressable>
  );
}

interface MatchListProps {
  readonly palette: Palette;
  readonly matches: readonly CommandMatch[];
  readonly highlighted: number;
  readonly query: string;
  readonly isExpression: boolean;
  readonly onRun: (command: Command) => void;
}

/** The rows in view around the highlighted one (or why there are none), and what the keys do. */
function MatchList({ palette, matches, highlighted, query, isExpression, onRun }: MatchListProps) {
  const t = useT();
  const { start, end } = visibleRows(matches.length, highlighted, VISIBLE_ROWS);
  const count = t(isExpression ? 'commands.palette.expressionCount' : 'commands.palette.count', { count: matches.length });
  const enter = t(isExpression ? 'commands.palette.footerPut' : 'commands.palette.footerRun');
  return (
    <>
      <View style={styles.list}>
        {matches.slice(start, end).map((match, i) => (
          <CommandRow key={match.command.id} palette={palette} match={match} isHighlighted={start + i === highlighted} onRun={onRun} />
        ))}
        {matches.length === 0 ? <Text style={[styles.empty, { color: palette.chromeMuted }]}>{emptyText(t, query, isExpression)}</Text> : null}
      </View>
      <Text style={[styles.footer, { color: palette.chromeMuted }]}>{t('commands.palette.footer', { count, enter })}</Text>
    </>
  );
}

/** Nothing found: what was typed, said for commands or for Expression Text. */
function emptyText(t: Translate, query: string, isExpression: boolean): string {
  return isExpression ? t('commands.palette.noExpression', { query: expressionQuery(query) }) : t('commands.palette.noCommand', { query });
}

/**
 * Tools ▸ Command Palette… (⇧⌘P): every command — the menus', the panels', the editor's keys and the edition palette's
 * tools — found by typing parts of its name or keywords ("exp pdf"), the recently run ones first, each with its key.
 * ↑ / ↓ choose, ↩ runs, Esc closes; the keys typed here stay out of the score (TextField). After “>” (or from Tools ▸
 * Expression Text…), Guitar Pro 8's Expression Text: a chord, dynamic, key, octave sign, clef or direction by name.
 */
export function CommandPalette({ palette, commands, state, recentIds, onRun, onClose, initialQuery = '' }: CommandPaletteProps) {
  const t = useT();
  // Expression Text's titles are built in the shown language: a change lists them again.
  const language = useLanguage();
  const [query, setQuery] = useState(initialQuery);
  const [highlighted, setHighlighted] = useState(0);
  const isExpression = isExpressionQuery(query);
  const matches = useMemo(
    () => (isExpression ? searchExpressionCommands(query, state) : searchCommands(commands, query, state, recentIds)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `language` rebuilds the expressions' titles
    [isExpression, commands, query, state, recentIds, language],
  );
  const current = Math.min(highlighted, Math.max(0, matches.length - 1));
  const runMatch = (match: CommandMatch | undefined) => {
    if (match?.isEnabled === true) {
      onRun(match.command);
    }
  };
  const onKeyDown = (event: KeyEvent) => {
    const { key } = event.nativeEvent;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      setHighlighted(moveHighlight(current, key === 'ArrowUp' ? -1 : 1, matches.length));
    } else if (key === 'Enter') {
      runMatch(matches[current]);
    }
  };
  return (
    <View style={styles.overlay}>
      <Pressable testID="command-palette-backdrop" style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel={t(isExpression ? 'commands.expression.title' : 'commands.palette.accessibility')}>
        {isExpression ? <Text style={[styles.heading, { color: palette.chromeText }]}>{t('commands.expression.title')}</Text> : null}
        <TextField
          testID="command-palette-field"
          value={query}
          onChangeText={(text) => {
            setQuery(text.replace(/\n/g, ''));
            setHighlighted(0);
          }}
          placeholder={t('commands.palette.placeholder')}
          placeholderTextColor={palette.chromeMuted}
          autoFocus
          multiline
          numberOfLines={1}
          keyDownEvents={LIST_KEYS}
          onKeyDown={onKeyDown}
          style={[styles.field, { color: palette.chromeText, backgroundColor: palette.chromeRaised, borderColor: palette.chromeBorder }]}
        />
        {isExpression ? <Text style={[styles.hint, { color: palette.chromeMuted }]}>{t('commands.expression.hint')}</Text> : null}
        <MatchList palette={palette} matches={matches} highlighted={current} query={query} isExpression={isExpression} onRun={onRun} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', paddingTop: 72 },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  panel: { width: 600, borderRadius: 10, borderWidth: 1, padding: 10 },
  field: { height: 36, fontSize: 15, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, borderWidth: 1 },
  heading: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginHorizontal: 4 },
  hint: { fontSize: 11, marginTop: 6, marginHorizontal: 4 },
  list: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 28, paddingHorizontal: 10, borderRadius: 5 },
  disabled: { opacity: 0.4 },
  title: { flex: 1, fontSize: 13, fontWeight: '600' },
  group: { fontSize: 11, marginHorizontal: 10 },
  keyCap: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  empty: { fontSize: 12, paddingHorizontal: 10, paddingVertical: 8 },
  footer: { fontSize: 11, marginTop: 8, marginHorizontal: 4 },
});
