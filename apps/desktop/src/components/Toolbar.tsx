import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Note, NoteAddress } from '@gp-editor/core';
import type { EditorAction } from '../state/editor';
import type { Palette } from '../theme';

/** What a toolbar button does: an editor action, or opening a file. */
export type ToolbarCommand = EditorAction | { readonly type: 'openFile' };

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
  readonly label: string;
  readonly command: ToolbarCommand;
  readonly isEnabled: boolean;
}

export function Toolbar({ palette, hasDocument, canUndo, canRedo, selection, selectedNote, onCommand }: ToolbarProps) {
  const hasNote = selectedNote !== undefined;
  const buttons: readonly ButtonSpec[] = [
    { label: 'Open…', command: { type: 'openFile' }, isEnabled: true },
    { label: 'Undo', command: { type: 'undo' }, isEnabled: canUndo },
    { label: 'Redo', command: { type: 'redo' }, isEnabled: canRedo },
    { label: 'Fret −', command: { type: 'shiftNoteFret', delta: -1 }, isEnabled: hasNote },
    { label: 'Fret +', command: { type: 'shiftNoteFret', delta: 1 }, isEnabled: hasNote },
    { label: 'String ↑', command: { type: 'shiftNoteString', delta: -1 }, isEnabled: hasNote },
    { label: 'String ↓', command: { type: 'shiftNoteString', delta: 1 }, isEnabled: hasNote },
    { label: 'Delete', command: { type: 'deleteNote' }, isEnabled: hasNote },
  ];
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      {buttons
        .filter((button) => hasDocument || button.command.type === 'openFile')
        .map((button) => (
          <Pressable
            key={button.label}
            disabled={!button.isEnabled}
            onPress={() => onCommand(button.command)}
            style={[styles.button, { borderColor: palette.border, opacity: button.isEnabled ? 1 : 0.4 }]}
          >
            <Text style={[styles.label, { color: button.command.type === 'openFile' ? palette.accent : palette.text }]}>{button.label}</Text>
          </Pressable>
        ))}
      <View style={styles.spacer} />
      {selection !== undefined && selectedNote !== undefined ? (
        <Text style={[styles.status, { color: palette.muted }]}>
          Bar {selection.measureIndex + 1} · beat {selection.beatIndex + 1} · voice {selection.voiceIndex + 1} · string {selectedNote.string} · fret{' '}
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
