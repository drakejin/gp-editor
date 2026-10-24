import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import type { NotePanel } from '../../lib/key-commands';
import type { EditorAction } from '../../state/editor';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { PALETTE_GROUPS } from './palette-groups';
import { MusicIcon } from './MusicIcon';
import { PaletteOptionStrip, PaletteTextField } from './PaletteStrips';
import { type PaletteContext, type PaletteGroup, type PaletteStepper, type PaletteTool, isToolEnabled, paletteContext } from './palette-tools';

export const EDITION_PALETTE_WIDTH = 214;
/** Rows of tools and steppers are this tall (the chrome's buttons are 26), so every group shows at the default window. */
export const PALETTE_ROW_HEIGHT = 24;
/** A stepper's − and + are this narrow, so the time signature's two numbers share a row. */
const STEPPER_BUTTON_WIDTH = 22;

export interface EditionPaletteProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly cursor?: StringAddress;
  readonly onEdit: (edit: SongEdit) => void;
  readonly onAction: (action: EditorAction) => void;
  /** The bend and vibrato tools open the same panels as C and B. */
  readonly onOpenPanel: (panel: NotePanel) => void;
  /** The chord tool opens the chord diagram panel, as K does. */
  readonly onOpenChordPanel?: () => void;
}

/**
 * Guitar Pro's edition palette, on the left: every setting of the note, beat and bar at the cursor — durations, the
 * note's techniques (bends, slides, hammer-ons, harmonics, palm mute … each with its key in the corner), articulations,
 * dynamics, strokes, and the bar's time signature, tempo, key, repeats and section. A lit button is what the cursor's
 * note, beat or bar has.
 */
function EditionPaletteView({ palette, song, cursor, onEdit, onAction, onOpenPanel, onOpenChordPanel }: EditionPaletteProps) {
  const context = paletteContext(song, cursor);
  // One tool's options or text field is open at a time, under its group.
  const [openToolId, setOpenToolId] = useState<string | undefined>(undefined);
  const press = (tool: PaletteTool) => {
    const { run } = tool;
    if (run.kind === 'edit') {
      onEdit(run.edit);
    } else if (run.kind === 'action') {
      onAction(run.action);
    } else if (run.kind === 'panel') {
      onOpenPanel(run.panel);
    } else if (run.kind === 'chordPanel') {
      onOpenChordPanel?.();
    } else {
      setOpenToolId(openToolId === tool.id ? undefined : tool.id);
    }
  };
  const choose = (songEdit: SongEdit) => {
    onEdit(songEdit);
    setOpenToolId(undefined);
  };
  return (
    <ScrollView style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
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
              icon={toolIcon(palette, tool, isActive)}
              tooltip={tool.tooltip}
              fontSize={11}
              minWidth={30}
              width={group.toolWidth}
              height={PALETTE_ROW_HEIGHT}
              isEnabled={isToolEnabled(tool, context)}
              isActive={isActive}
              onPress={() => onPress(tool)}
            />
          );
        })}
      </View>
      {open?.run.kind === 'options' ? <PaletteOptionStrip palette={palette} options={open.run.options} context={context} onChoose={onChoose} /> : null}
      {open?.run.kind === 'text' ? <PaletteTextField palette={palette} key={open.id} run={open.run} context={context} onChoose={onChoose} /> : null}
      {stepperRows(group.steppers ?? []).map((row) => (
        <StepperRow key={row[0]?.id} palette={palette} steppers={row} context={context} onEdit={onEdit} />
      ))}
    </View>
  );
}

/** A music glyph, or (for a tool with a key) the face with its key in the corner; undefined for a plain text face. */
function toolIcon(palette: Palette, tool: PaletteTool, isActive: boolean) {
  const color = isActive ? palette.chromeAccentText : palette.chromeText;
  const face = tool.glyph === undefined ? undefined : <MusicIcon glyph={tool.face} kind={tool.glyph} color={color} />;
  if (tool.key === undefined) {
    return face;
  }
  return (
    <View style={styles.keyedFace}>
      {face ?? (
        <Text numberOfLines={1} style={[styles.faceText, { color }]}>
          {tool.face}
        </Text>
      )}
      <Text style={[styles.keyBadge, face === undefined ? null : styles.keyBesideGlyph, { color: isActive ? palette.chromeAccentText : palette.chromeMuted }]}>{tool.key}</Text>
    </View>
  );
}

/** A group's steppers in rows: a stepper beside the previous one shares its row. */
function stepperRows(steppers: readonly PaletteStepper[]): readonly (readonly PaletteStepper[])[] {
  return steppers.reduce<readonly (readonly PaletteStepper[])[]>((rows, stepper) => {
    const last = rows[rows.length - 1];
    return stepper.isBesidePrevious === true && last !== undefined ? [...rows.slice(0, -1), [...last, stepper]] : [...rows, [stepper]];
  }, []);
}

interface StepperProps {
  readonly palette: Palette;
  readonly context: PaletteContext;
  readonly onEdit: (edit: SongEdit) => void;
}

/** One row: the first stepper's label, then each stepper's − value +; a value that can be typed (the tempo) opens a field under the row on a click. */
function StepperRow({ palette, steppers, context, onEdit }: StepperProps & { readonly steppers: readonly PaletteStepper[] }) {
  const [typingId, setTypingId] = useState<string | undefined>(undefined);
  const typed = steppers.find((stepper) => stepper.id === typingId)?.typed;
  return (
    <>
      <View style={styles.stepper}>
        <Text style={[styles.stepperLabel, { color: palette.chromeMuted }]}>{steppers[0]?.label}</Text>
        {steppers.map((stepper) => (
          <StepperControl
            key={stepper.id}
            palette={palette}
            stepper={stepper}
            context={context}
            onEdit={onEdit}
            onType={() => setTypingId(typingId === stepper.id ? undefined : stepper.id)}
          />
        ))}
      </View>
      {typed === undefined ? null : (
        <PaletteTextField
          palette={palette}
          run={{ kind: 'text', ...typed }}
          context={context}
          onChoose={(edit) => {
            setTypingId(undefined);
            onEdit(edit);
          }}
        />
      )}
    </>
  );
}

function StepperControl({ palette, stepper, context, onEdit, onType }: StepperProps & { readonly stepper: PaletteStepper; readonly onType: () => void }) {
  const isEnabled = context.header !== undefined && (stepper.isEnabled?.(context) ?? true);
  const { typed } = stepper;
  const value = <Text style={[styles.stepperValue, { color: palette.chromeText }]}>{stepper.value(context)}</Text>;
  return (
    <>
      <ChromeButton palette={palette} label="−" tooltip={`${stepper.tooltip}: less`} minWidth={STEPPER_BUTTON_WIDTH} height={PALETTE_ROW_HEIGHT} isEnabled={isEnabled} onPress={() => onEdit(stepper.minus)} />
      {typed === undefined ? (
        value
      ) : (
        <Pressable testID={`palette-value-${stepper.id}`} tooltip={`${typed.placeholder}: click to type`} disabled={!isEnabled} onPress={onType} style={styles.stepperPress}>
          {value}
        </Pressable>
      )}
      <ChromeButton palette={palette} label="+" tooltip={`${stepper.tooltip}: more`} minWidth={STEPPER_BUTTON_WIDTH} height={PALETTE_ROW_HEIGHT} isEnabled={isEnabled} onPress={() => onEdit(stepper.plus)} />
    </>
  );
}

export const EditionPalette = memo(EditionPaletteView);

const styles = StyleSheet.create({
  panel: { width: EDITION_PALETTE_WIDTH, borderRightWidth: 1, flexGrow: 0 },
  group: { paddingHorizontal: 8, paddingVertical: 2, borderBottomWidth: 1 },
  groupTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginLeft: 2 },
  tools: { flexDirection: 'row', flexWrap: 'wrap' },
  keyedFace: { flexDirection: 'row', alignItems: 'center' },
  faceText: { fontSize: 10.5, fontWeight: '600' },
  /** The key, small and raised like an exponent. */
  keyBadge: { fontSize: 8, fontWeight: '700', marginLeft: 2, alignSelf: 'flex-start', marginTop: 1 },
  /** A glyph sits low in its 24-point box: the key goes level with its top. */
  keyBesideGlyph: { marginTop: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperLabel: { width: 46, fontSize: 11 },
  stepperValue: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  stepperPress: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
});
