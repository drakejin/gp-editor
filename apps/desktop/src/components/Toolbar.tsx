import { StyleSheet, Text, View } from 'react-native';
import type { Note, StringAddress } from '@gp-editor/core';
import { SCORE_MODES, SCORE_MODE_LABELS, type ScoreMode } from '../score/geometry';
import type { EditorAction } from '../state/editor';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

/** What a toolbar button does: an editor action, a new sheet (in the selected view), opening or saving a file, or
 * starting/stopping playback. */
export type ToolbarCommand =
  | EditorAction
  | { readonly type: 'newFile' }
  | { readonly type: 'openFile' }
  | { readonly type: 'saveFile' }
  | { readonly type: 'togglePlayback' };

interface ToolbarProps {
  readonly palette: Palette;
  readonly hasDocument: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly isPlaying: boolean;
  readonly isEdited: boolean;
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

export function Toolbar(props: ToolbarProps) {
  const { palette, hasDocument, isPlaying, mode, cursorNote } = props;
  const hasNote = cursorNote !== undefined;
  const groups: readonly (readonly ButtonSpec[])[] = [
    [
      { label: 'New', command: { type: 'newFile' }, isEnabled: true },
      { label: 'Open…', command: { type: 'openFile' }, isEnabled: true },
      {
        label: props.isEdited ? 'Save •' : 'Save',
        command: { type: 'saveFile' },
        isEnabled: hasDocument,
      },
      {
        label: isPlaying ? '■ Stop' : '▶ Play',
        command: { type: 'togglePlayback' },
        isEnabled: hasDocument,
        isActive: isPlaying,
      },
    ],
    SCORE_MODES.map(option => ({
      label: SCORE_MODE_LABELS[option],
      command: { type: 'setMode', mode: option },
      isEnabled: hasDocument,
      isActive: option === mode,
    })),
    [
      { label: 'Undo', command: { type: 'undo' }, isEnabled: props.canUndo },
      { label: 'Redo', command: { type: 'redo' }, isEnabled: props.canRedo },
      {
        label: 'Fret −',
        command: { type: 'shiftNoteFret', delta: -1 },
        isEnabled: hasNote,
      },
      {
        label: 'Fret +',
        command: { type: 'shiftNoteFret', delta: 1 },
        isEnabled: hasNote,
      },
      {
        label: 'Move ↑',
        command: { type: 'shiftNoteString', delta: -1 },
        isEnabled: hasNote,
      },
      {
        label: 'Move ↓',
        command: { type: 'shiftNoteString', delta: 1 },
        isEnabled: hasNote,
      },
      { label: 'Delete', command: { type: 'deleteNote' }, isEnabled: hasNote },
    ],
  ];
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.sidebar, borderColor: palette.border },
      ]}
    >
      {groups
        .filter((group, i) => hasDocument || i === 0)
        .map((group, i) => (
          <View key={i} style={styles.group}>
            {group.map(button => (
              <ToolbarButton
                key={button.label}
                button={button}
                palette={palette}
                onCommand={props.onCommand}
              />
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

function ToolbarButton({
  button,
  palette,
  onCommand,
}: {
  button: ButtonSpec;
  palette: Palette;
  onCommand: (command: ToolbarCommand) => void;
}) {
  const isAccent =
    button.command.type === 'newFile' ||
    button.command.type === 'openFile' ||
    button.command.type === 'saveFile' ||
    button.command.type === 'togglePlayback';
  return (
    <BarButton
      label={button.label}
      palette={palette}
      isEnabled={button.isEnabled}
      isActive={button.isActive}
      isAccent={isAccent}
      onPress={() => onCommand(button.command)}
    />
  );
}

function statusText({ hasDocument, cursor, cursorNote }: ToolbarProps): string {
  if (!hasDocument || cursor === undefined) {
    return '';
  }
  const place = `Bar ${cursor.measureIndex + 1} · beat ${
    cursor.beatIndex + 1
  } · string ${cursor.string}`;
  return `${place} · ${
    cursorNote === undefined ? 'empty' : `fret ${cursorNote.fret}`
  }`;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  group: { flexDirection: 'row', marginRight: 12 },
  spacer: { flex: 1 },
  status: { fontSize: 11, flexShrink: 1 },
});
