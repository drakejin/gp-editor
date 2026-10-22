import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Note, StringAddress } from '@gp-editor/core';
import { SCORE_MODES, type ScoreMode } from '../score/geometry';
import type { EditorAction } from '../state/editor';
import type { Palette } from '../theme';

/** What a toolbar button does: an editor action, opening a file, or starting/stopping playback. */
export type ToolbarCommand = EditorAction | { readonly type: 'openFile' } | { readonly type: 'togglePlayback' };

interface ToolbarProps {
  readonly palette: Palette;
  readonly hasDocument: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isPlaying: boolean;
  readonly mode: ScoreMode;
  readonly cursor?: StringAddress;
  readonly cursorNote?: Note;
  readonly onCommand: (command: ToolbarCommand) => void;
}

interface ButtonSpec {
  readonly label: string;
  readonly command: ToolbarCommand;
  readonly isEnabled: boolean;
  readonly isActive?: boolean;
}

const MODE_LABELS: Readonly<Record<ScoreMode, string>> = { notationAndTab: 'Score + Tab', notation: 'Score', tab: 'Tab' };

export function Toolbar(props: ToolbarProps) {
  const { palette, hasDocument, isPlaying, mode, cursorNote } = props;
  const hasNote = cursorNote !== undefined;
  const groups: readonly (readonly ButtonSpec[])[] = [
    [
      { label: 'Open…', command: { type: 'openFile' }, isEnabled: true },
      { label: isPlaying ? '■ Stop' : '▶ Play', command: { type: 'togglePlayback' }, isEnabled: hasDocument, isActive: isPlaying },
    ],
    SCORE_MODES.map((option) => ({ label: MODE_LABELS[option], command: { type: 'setMode', mode: option }, isEnabled: hasDocument, isActive: option === mode })),
    [
      { label: 'Undo', command: { type: 'undo' }, isEnabled: props.canUndo },
      { label: 'Redo', command: { type: 'redo' }, isEnabled: props.canRedo },
      { label: 'Fret −', command: { type: 'shiftNoteFret', delta: -1 }, isEnabled: hasNote },
      { label: 'Fret +', command: { type: 'shiftNoteFret', delta: 1 }, isEnabled: hasNote },
      { label: 'Move ↑', command: { type: 'shiftNoteString', delta: -1 }, isEnabled: hasNote },
      { label: 'Move ↓', command: { type: 'shiftNoteString', delta: 1 }, isEnabled: hasNote },
      { label: 'Delete', command: { type: 'deleteNote' }, isEnabled: hasNote },
    ],
  ];
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      {groups
        .filter((group, i) => hasDocument || i === 0)
        .map((group, i) => (
          <View key={i} style={styles.group}>
            {group.map((button) => (
              <ToolbarButton key={button.label} button={button} palette={palette} onCommand={props.onCommand} />
            ))}
          </View>
        ))}
      <View style={styles.spacer} />
      <Text numberOfLines={1} style={[styles.status, { color: palette.muted }]}>
        {statusText(props)}
      </Text>
    </View>
  );
}

function ToolbarButton({ button, palette, onCommand }: { button: ButtonSpec; palette: Palette; onCommand: (command: ToolbarCommand) => void }) {
  const isAccent = button.command.type === 'openFile' || button.command.type === 'togglePlayback';
  return (
    <Pressable
      disabled={!button.isEnabled}
      onPress={() => onCommand(button.command)}
      style={[
        styles.button,
        { borderColor: palette.border, opacity: button.isEnabled ? 1 : 0.4 },
        button.isActive === true ? { backgroundColor: palette.selection } : null,
      ]}
    >
      <Text style={[styles.label, { color: isAccent ? palette.accent : palette.text }]}>{button.label}</Text>
    </Pressable>
  );
}

function statusText({ hasDocument, cursor, cursorNote }: ToolbarProps): string {
  if (!hasDocument) {
    return '';
  }
  const hint = '←→ beat · ↑↓ string · 0–9 fret · ⌥↑↓ move note · ⌫ delete · Space play';
  if (cursor === undefined) {
    return hint;
  }
  const place = `Bar ${cursor.measureIndex + 1} · beat ${cursor.beatIndex + 1} · string ${cursor.string}`;
  return `${place} · ${cursorNote === undefined ? 'empty' : `fret ${cursorNote.fret}`}   ${hint}`;
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  group: { flexDirection: 'row', marginRight: 12 },
  button: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, marginRight: 4 },
  label: { fontSize: 12, fontWeight: '600' },
  spacer: { flex: 1 },
  status: { fontSize: 11, flexShrink: 1 },
});
