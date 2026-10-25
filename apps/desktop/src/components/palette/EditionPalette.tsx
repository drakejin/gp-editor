import { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Song, StringAddress } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { useStableCallback } from '../../hooks/use-stable-callback';
import type { NotePanel } from '../../lib/key-commands';
import type { EditorAction } from '../../state/editor';
import type { SongEdit } from '../../state/song-edits';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { paletteGroups } from './palette-groups';
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
  /** Multivoice edition is on: its palette button is lit. */
  readonly isMultivoice?: boolean;
  /** Design Mode is on: its palette button is lit. */
  readonly isDesignMode?: boolean;
  readonly onEdit: (edit: SongEdit) => void;
  readonly onAction: (action: EditorAction) => void;
  /** The bend and vibrato tools open the same panels as C and B. */
  readonly onOpenPanel: (panel: NotePanel) => void;
  /** The chord tool opens the chord diagram panel, as K does. */
  readonly onOpenChordPanel?: () => void;
  /** The > tool opens the command palette's Expression Text (lit while it is open). */
  readonly onOpenExpressionText?: () => void;
  readonly isExpressionTextOpen?: boolean;
}

/**
 * Guitar Pro's edition palette, on the left: every setting of the note, beat and bar at the cursor — durations, the
 * note's techniques (bends, slides, hammer-ons, harmonics, palm mute … each with its key in the corner), articulations,
 * dynamics, strokes, and the bar's time signature, tempo, key, repeats and section. A lit button is what the cursor's
 * note, beat or bar has.
 */
function EditionPaletteView({ palette, song, cursor, isMultivoice = false, isDesignMode = false, onEdit, onAction, onOpenPanel, onOpenChordPanel, onOpenExpressionText, isExpressionTextOpen = false }: EditionPaletteProps) {
  // The groups' texts are built in the shown language (useT re-renders the palette when it changes).
  useT();
  const context = { ...paletteContext(song, cursor), isMultivoice, isDesignMode };
  // One tool's options or text field is open at a time, under its group.
  const [openToolId, setOpenToolId] = useState<string | undefined>(undefined);
  // The same function on every render: the tool buttons (memoised) redraw only when they change.
  const press = useStableCallback((tool: PaletteTool) => {
    const { run } = tool;
    if (run.kind === 'edit') {
      onEdit(run.edit);
    } else if (run.kind === 'action') {
      onAction(run.action);
    } else if (run.kind === 'panel') {
      onOpenPanel(run.panel);
    } else if (run.kind === 'chordPanel') {
      onOpenChordPanel?.();
    } else if (run.kind === 'expressionText') {
      onOpenExpressionText?.();
    } else {
      setOpenToolId(openToolId === tool.id ? undefined : tool.id);
    }
  });
  const choose = (songEdit: SongEdit) => {
    onEdit(songEdit);
    setOpenToolId(undefined);
  };
  return (
    <ScrollView style={[styles.panel, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
      {paletteGroups().map((group) => (
        // The > tool is lit while Expression Text is open.
        <GroupView key={group.id} palette={palette} group={group} context={context} openToolId={isExpressionTextOpen ? 'expressionText' : openToolId} onPress={press} onChoose={choose} onEdit={onEdit} />
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
        {group.tools.map((tool) => (
          <ToolButton
            key={tool.id}
            palette={palette}
            tool={tool}
            width={tool.width ?? group.toolWidth}
            isEnabled={isToolEnabled(tool, context)}
            isActive={tool.id === openToolId || (tool.isActive?.(context) ?? false)}
            onPress={onPress}
          />
        ))}
      </View>
      {open?.run.kind === 'options' ? <PaletteOptionStrip palette={palette} options={open.run.options} context={context} onChoose={onChoose} /> : null}
      {open?.run.kind === 'text' ? <PaletteTextField palette={palette} key={open.id} run={open.run} context={context} onChoose={onChoose} /> : null}
      {stepperRows(group.steppers ?? []).map((row) => (
        <StepperRow key={row[0]?.id} palette={palette} steppers={row} context={context} onEdit={onEdit} />
      ))}
    </View>
  );
}

interface ToolButtonProps {
  readonly palette: Palette;
  readonly tool: PaletteTool;
  readonly width?: number;
  readonly isEnabled: boolean;
  readonly isActive: boolean;
  readonly onPress: (tool: PaletteTool) => void;
}

/** One tool; memoised: a cursor move redraws only the tools it lights, greys or ungreys. */
function ToolButtonView({ palette, tool, width, isEnabled, isActive, onPress }: ToolButtonProps) {
  return (
    <ChromeButton
      testID={`palette-${tool.id}`}
      palette={palette}
      label={tool.face}
      icon={toolIcon(palette, tool, isActive)}
      tooltip={tool.tooltip}
      fontSize={11}
      minWidth={30}
      width={width}
      height={PALETTE_ROW_HEIGHT}
      isEnabled={isEnabled}
      isActive={isActive}
      onPress={() => onPress(tool)}
    />
  );
}

const ToolButton = memo(ToolButtonView);

/** Hangul syllables a keyed face shows at the usual size; a longer word (슬라이드, 비브라토) is set smaller to fit beside its key. */
const KEYED_FACE_SYLLABLES = 3;

function isLongHangulFace(face: string): boolean {
  return (face.match(/[\uAC00-\uD7A3]/g)?.length ?? 0) > KEYED_FACE_SYLLABLES;
}

/** A music glyph, or (for a tool with a key) the face with its key in the corner; undefined for a plain text face. */
function toolIcon(palette: Palette, tool: PaletteTool, isActive: boolean) {
  const color = isActive ? palette.chromeAccentText : palette.chromeText;
  const face = tool.glyph === undefined ? undefined : <MusicIcon glyph={tool.face} kind={tool.glyph} color={color} />;
  if (tool.tint !== undefined) {
    return <TintedFace testID={`palette-${tool.id}-tint`} face={tool.face} color={color} tint={tool.tint(palette)} />;
  }
  if (tool.key === undefined) {
    return face;
  }
  return (
    <View style={styles.keyedFace}>
      {face ?? (
        <Text numberOfLines={1} style={[styles.faceText, isLongHangulFace(tool.face) ? styles.longFaceText : null, { color }]}>
          {tool.face}
        </Text>
      )}
      <Text style={[styles.keyBadge, face === undefined ? null : styles.keyBesideGlyph, { color: isActive ? palette.chromeAccentText : palette.chromeMuted }]}>{tool.key}</Text>
    </View>
  );
}

/** A text face over a strip of its colour (the Voice buttons). */
function TintedFace({ testID, face, color, tint }: { readonly testID: string; readonly face: string; readonly color: string; readonly tint: string }) {
  return (
    <View style={styles.tintedFace}>
      <Text numberOfLines={1} style={[styles.faceText, { color }]}>
        {face}
      </Text>
      <View testID={testID} style={[styles.tintStrip, { backgroundColor: tint }]} />
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

interface StepperRowProps {
  readonly palette: Palette;
  readonly steppers: readonly PaletteStepper[];
  readonly context: PaletteContext;
  readonly onEdit: (edit: SongEdit) => void;
}

/** One row: the first stepper's label, then each stepper's − value +; a value that can be typed (the tempo) opens a field under the row on a click. */
function StepperRow({ palette, steppers, context, onEdit }: StepperRowProps) {
  const [typingId, setTypingId] = useState<string | undefined>(undefined);
  const toggleTyping = useCallback((id: string) => setTypingId((current) => (current === id ? undefined : id)), []);
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
            value={stepper.value(context)}
            isEnabled={context.header !== undefined && (stepper.isEnabled?.(context) ?? true)}
            onEdit={onEdit}
            onType={toggleTyping}
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

interface StepperControlProps {
  readonly palette: Palette;
  readonly stepper: PaletteStepper;
  readonly value: string;
  readonly isEnabled: boolean;
  readonly onEdit: (edit: SongEdit) => void;
  /** A click on a typed value: its field opens (or closes). */
  readonly onType: (stepperId: string) => void;
}

/** − value +; memoised: a cursor move redraws only the steppers whose value it changes. */
function StepperControlView({ palette, stepper, value, isEnabled, onEdit, onType }: StepperControlProps) {
  const t = useT();
  const { typed } = stepper;
  const shown = <Text style={[styles.stepperValue, { color: palette.chromeText }]}>{value}</Text>;
  return (
    <>
      <ChromeButton palette={palette} label="−" tooltip={t('palette.stepper.less', { tooltip: stepper.tooltip })} minWidth={STEPPER_BUTTON_WIDTH} height={PALETTE_ROW_HEIGHT} isEnabled={isEnabled} onPress={() => onEdit(stepper.minus)} />
      {typed === undefined ? (
        shown
      ) : (
        <Pressable testID={`palette-value-${stepper.id}`} tooltip={t('palette.stepper.clickToType', { placeholder: typed.placeholder })} disabled={!isEnabled} onPress={() => onType(stepper.id)} style={styles.stepperPress}>
          {shown}
        </Pressable>
      )}
      <ChromeButton palette={palette} label="+" tooltip={t('palette.stepper.more', { tooltip: stepper.tooltip })} minWidth={STEPPER_BUTTON_WIDTH} height={PALETTE_ROW_HEIGHT} isEnabled={isEnabled} onPress={() => onEdit(stepper.plus)} />
    </>
  );
}

const StepperControl = memo(StepperControlView);

export const EditionPalette = memo(EditionPaletteView);

const styles = StyleSheet.create({
  panel: { width: EDITION_PALETTE_WIDTH, borderRightWidth: 1, flexGrow: 0 },
  group: { paddingHorizontal: 8, paddingVertical: 2, borderBottomWidth: 1 },
  groupTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginLeft: 2 },
  tools: { flexDirection: 'row', flexWrap: 'wrap' },
  keyedFace: { flexDirection: 'row', alignItems: 'center' },
  tintedFace: { alignItems: 'center' },
  tintStrip: { width: 14, height: 3, borderRadius: 1.5, marginTop: 1 },
  faceText: { fontSize: 10.5, fontWeight: '600' },
  longFaceText: { fontSize: 9 },
  /** The key, small and raised like an exponent. */
  keyBadge: { fontSize: 8, fontWeight: '700', marginLeft: 2, alignSelf: 'flex-start', marginTop: 1 },
  /** A glyph sits low in its 24-point box: the key goes level with its top. */
  keyBesideGlyph: { marginTop: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperLabel: { width: 46, fontSize: 11 },
  stepperValue: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  stepperPress: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
});
