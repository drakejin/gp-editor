import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Note, NoteAddress } from '@gp-editor/core';
import type { Palette } from '../theme';

export type ToolbarCommand =
  | 'open'
  | 'undo'
  | 'redo'
  | 'fretDown'
  | 'fretUp'
  | 'stringUp'
  | 'stringDown'
  | 'delete';

interface ToolbarProps {
  readonly palette: Palette;
  readonly hasDocument: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly selection?: NoteAddress;
  readonly selectedNote?: Note;
  readonly onCommand: (command: ToolbarCommand) => void;
}

interface ButtonSpec {
  readonly command: ToolbarCommand;
  readonly label: string;
  readonly enabled: boolean;
}

export function Toolbar({ palette, hasDocument, canUndo, canRedo, selection, selectedNote, onCommand }: ToolbarProps) {
  const hasNote = selectedNote !== undefined;
  const buttons: readonly ButtonSpec[] = [
    { command: 'open', label: 'Open…', enabled: true },
    { command: 'undo', label: 'Undo', enabled: canUndo },
    { command: 'redo', label: 'Redo', enabled: canRedo },
    { command: 'fretDown', label: 'Fret −', enabled: hasNote },
    { command: 'fretUp', label: 'Fret +', enabled: hasNote },
    { command: 'stringUp', label: 'String ↑', enabled: hasNote },
    { command: 'stringDown', label: 'String ↓', enabled: hasNote },
    { command: 'delete', label: 'Delete', enabled: hasNote },
  ];
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      {buttons
        .filter((button) => hasDocument || button.command === 'open')
        .map((button) => (
          <Pressable
            key={button.command}
            disabled={!button.enabled}
            onPress={() => onCommand(button.command)}
            style={[styles.button, { borderColor: palette.border, opacity: button.enabled ? 1 : 0.4 }]}
          >
            <Text style={[styles.label, { color: button.command === 'open' ? palette.accent : palette.text }]}>{button.label}</Text>
          </Pressable>
        ))}
      <View style={styles.spacer} />
      {selection !== undefined && selectedNote !== undefined ? (
        <Text style={[styles.status, { color: palette.muted }]}>
          Bar {selection.measure + 1} · beat {selection.beat + 1} · voice {selection.voice + 1} · string {selectedNote.string} · fret{' '}
          {selectedNote.fret}
        </Text>
      ) : hasDocument ? (
        <Text style={[styles.status, { color: palette.muted }]}>Click a fret number to edit · 0–9 type a fret · ↑↓ string · ⌫ delete · ⌘Z undo</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  button: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, marginRight: 6 },
  label: { fontSize: 12, fontWeight: '600' },
  spacer: { flex: 1 },
  status: { fontSize: 11 },
});
