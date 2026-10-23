import { useMemo, useState } from 'react';
import { type KeyEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { type CommandMatch, moveHighlight, searchCommands, visibleRows } from '../lib/command-search';
import type { Command, CommandState } from '../lib/command-types';
import { plural } from '../lib/wording';
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
}

/** Rows shown at once; ↑ and ↓ move the window along the list. */
const VISIBLE_ROWS = 12;
/** The field keeps these keys for the list: they move the highlighted row and run it. */
const LIST_KEYS = [{ key: 'ArrowUp' }, { key: 'ArrowDown' }, { key: 'Enter' }];

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

/**
 * Tools ▸ Command Palette… (⇧⌘P): every command — the menus', the panels', the editor's keys and the edition palette's
 * tools — found by typing parts of its name or keywords ("exp pdf"), the recently run ones first, each with its key.
 * ↑ / ↓ choose, ↩ runs, Esc closes; the keys typed here stay out of the score (TextField).
 */
export function CommandPalette({ palette, commands, state, recentIds, onRun, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const matches = useMemo(() => searchCommands(commands, query, state, recentIds), [commands, query, state, recentIds]);
  const current = Math.min(highlighted, Math.max(0, matches.length - 1));
  const { start, end } = visibleRows(matches.length, current, VISIBLE_ROWS);
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
      <View style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} accessibilityLabel="Command palette">
        <TextField
          testID="command-palette-field"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setHighlighted(0);
          }}
          placeholder="Type a command (e.g. exp pdf, transpose)"
          placeholderTextColor={palette.chromeMuted}
          autoFocus
          keyDownEvents={LIST_KEYS}
          onKeyDown={onKeyDown}
          style={[styles.field, { color: palette.chromeText, backgroundColor: palette.chromeRaised, borderColor: palette.chromeBorder }]}
        />
        <View style={styles.list}>
          {matches.slice(start, end).map((match, i) => (
            <CommandRow key={match.command.id} palette={palette} match={match} isHighlighted={start + i === current} onRun={onRun} />
          ))}
          {matches.length === 0 ? <Text style={[styles.empty, { color: palette.chromeMuted }]}>No command matches “{query}”.</Text> : null}
        </View>
        <Text style={[styles.footer, { color: palette.chromeMuted }]}>
          {plural(matches.length, 'command')} · ↑ ↓ choose · ↩ run · Esc close
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', paddingTop: 72 },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  panel: { width: 600, borderRadius: 10, borderWidth: 1, padding: 10 },
  field: { fontSize: 15, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, borderWidth: 1 },
  list: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 28, paddingHorizontal: 10, borderRadius: 5 },
  disabled: { opacity: 0.4 },
  title: { flex: 1, fontSize: 13, fontWeight: '600' },
  group: { fontSize: 11, marginHorizontal: 10 },
  keyCap: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  empty: { fontSize: 12, paddingHorizontal: 10, paddingVertical: 8 },
  footer: { fontSize: 11, marginTop: 8, marginHorizontal: 4 },
});
