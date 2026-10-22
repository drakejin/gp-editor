import { memo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import type { EditorAction } from '../../state/editor';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { PALETTE_GROUPS } from './palette-groups';
import { MusicIcon } from './MusicIcon';
import { PaletteOptionStrip, PaletteTextField } from './PaletteStrips';
import { type PaletteContext, type PaletteGroup, type PaletteStepper, type PaletteTool, isToolEnabled, paletteContext } from './palette-tools';

export const EDITION_PALETTE_WIDTH = 214;

export interface EditionPaletteProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly cursor?: StringAddress;
  readonly onEdit: (edit: SongEdit) => void;
  readonly onAction: (action: EditorAction) => void;
}

/**
 * Guitar Pro's edition palette, on the left: every setting of the note, beat and bar at the cursor — durations,
 * dynamics, articulations, effects with their options (bends, slides, harmonics, trills …), strokes, and the bar's
 * time signature, tempo, key, repeats and section. A lit button is what the cursor's note, beat or bar has.
 */
function EditionPaletteView({ palette, song, cursor, onEdit, onAction }: EditionPaletteProps) {
  const context = paletteContext(song, cursor);
  // One tool's options or text field is open at a time, under its group.
  const [openToolId, setOpenToolId] = useState<string | undefined>(undefined);
  const press = (tool: PaletteTool) => {
    const { run } = tool;
    if (run.kind === 'edit') {
      onEdit(run.edit);
    } else if (run.kind === 'action') {
      onAction(run.action);
    } else {
      setOpenToolId(openToolId === tool.id ? undefined : tool.id);
    }
  };
  const choose = (songEdit: SongEdit) => {
    onEdit(songEdit);
    setOpenToolId(undefined);
  };
  return (
    <ScrollView style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]} contentContainerStyle={styles.content}>
      {PALETTE_GROUPS.map((group) => (
        <GroupView key={group.title} palette={palette} group={group} context={context} openToolId={openToolId} onPress={press} onChoose={choose} onEdit={onEdit} />
      ))}
    </ScrollView>
  );
}

interface GroupViewProps {
  readonly palette: Palette;
  readonly group: PaletteGroup;
  readonly context: PaletteContext;
  readonly openToolId?: string;
  readonly onPress: (tool: PaletteTool) => void;
  readonly onChoose: (edit: SongEdit) => void;
  readonly onEdit: (edit: SongEdit) => void;
}

function GroupView({ palette, group, context, openToolId, onPress, onChoose, onEdit }: GroupViewProps) {
  const open = group.tools.find((tool) => tool.id === openToolId);
  return (
    <View style={[styles.group, { borderColor: palette.chromeBorder }]} accessibilityLabel={group.title}>
      <Text style={[styles.groupTitle, { color: palette.chromeMuted }]}>{group.title.toUpperCase()}</Text>
      <View style={styles.tools}>
        {group.tools.map((tool) => {
          const isActive = tool.id === openToolId || (tool.isActive?.(context) ?? false);
          return (
            <ChromeButton
              key={tool.id}
              testID={`palette-${tool.id}`}
              palette={palette}
              label={tool.face}
              icon={tool.glyph === undefined ? undefined : <MusicIcon glyph={tool.face} kind={tool.glyph} color={isActive ? palette.chromeAccentText : palette.chromeText} />}
              tooltip={tool.tooltip}
              fontSize={11}
              minWidth={30}
              isEnabled={isToolEnabled(tool, context)}
              isActive={isActive}
              onPress={() => onPress(tool)}
            />
          );
        })}
      </View>
      {open?.run.kind === 'options' ? <PaletteOptionStrip palette={palette} options={open.run.options} context={context} onChoose={onChoose} /> : null}
      {open?.run.kind === 'text' ? <PaletteTextField palette={palette} key={open.id} run={open.run} context={context} onChoose={onChoose} /> : null}
      {(group.steppers ?? []).map((stepper) => (
        <StepperRow key={stepper.id} palette={palette} stepper={stepper} context={context} onEdit={onEdit} />
      ))}
    </View>
  );
}

function StepperRow({ palette, stepper, context, onEdit }: { readonly palette: Palette; readonly stepper: PaletteStepper; readonly context: PaletteContext; readonly onEdit: (edit: SongEdit) => void }) {
  const isEnabled = context.header !== undefined && (stepper.isEnabled?.(context) ?? true);
  return (
    <View style={styles.stepper}>
      <Text style={[styles.stepperLabel, { color: palette.chromeMuted }]}>{stepper.label}</Text>
      <ChromeButton palette={palette} label="−" tooltip={`${stepper.tooltip}: less`} isEnabled={isEnabled} onPress={() => onEdit(stepper.minus)} />
      <Text style={[styles.stepperValue, { color: palette.chromeText }]}>{stepper.value(context)}</Text>
      <ChromeButton palette={palette} label="+" tooltip={`${stepper.tooltip}: more`} isEnabled={isEnabled} onPress={() => onEdit(stepper.plus)} />
    </View>
  );
}

export const EditionPalette = memo(EditionPaletteView);

const styles = StyleSheet.create({
  panel: { width: EDITION_PALETTE_WIDTH, borderRightWidth: 1, flexGrow: 0 },
  content: { paddingBottom: 16 },
  group: { paddingHorizontal: 8, paddingTop: 7, paddingBottom: 6, borderBottomWidth: 1 },
  groupTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4, marginLeft: 2 },
  tools: { flexDirection: 'row', flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  stepperLabel: { width: 62, fontSize: 11 },
  stepperValue: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
});
