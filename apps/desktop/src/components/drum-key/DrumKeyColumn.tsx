import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type DrumKeyGroup,
  drumEntryDetail,
  drumEntryName,
  drumGroupName,
  drumVariantName,
} from '../../lib/drum-key';
import { ScoreCanvas } from '../../native/score-canvas';
import { translateCommands } from '../../score/draw';
import { DRUM_KEY_LAYOUT } from '../../lib/drum-key-layout';
import {
  type DrumKeyColors,
  type DrumKeyStaffBox,
  drumKeyBracket,
  engraveDrumKeyStaff,
} from '../../score/drum-key-staff';
import type { Palette } from '../../theme';

/** The bracket under a column's name, and room for each drum's name (two short lines) above its staff. */
const DRUM_KEY_COLUMN = { bracketHeight: 8, labelHeight: 30 } as const;

interface DrumKeyColumnProps {
  readonly palette: Palette;
  readonly group: DrumKeyGroup;
  /** The column's width: its drums share it. */
  readonly width: number;
  readonly box: DrumKeyStaffBox;
  readonly colors: DrumKeyColors;
  /** The drum the mouse is over, when it is one of this column's. */
  readonly litKey?: number;
  readonly onLight: (key: number | undefined) => void;
}

/**
 * One column of the Drum Key, as the reference legend draws it: the element's name over a bracket, each drum's name,
 * and one staff with each drum where the score writes it — bracket and staff on one canvas, drawn by the score's
 * engraving. Each drum is a hover area: its full name and key show in the card's last line and as its tooltip.
 */
function DrumKeyColumnView({
  palette,
  group,
  width,
  box,
  colors,
  litKey,
  onLight,
}: DrumKeyColumnProps) {
  const keys = useMemo(() => group.entries.map(entry => entry.key), [group]);
  const column = width / Math.max(1, keys.length);
  const { bracketHeight, labelHeight } = DRUM_KEY_COLUMN;
  const commands = useMemo(
    () => [
      ...drumKeyBracket(width, colors.line),
      ...translateCommands(
        engraveDrumKeyStaff({ keys, box, colors, litKey, column }),
        0,
        bracketHeight + labelHeight,
      ),
    ],
    [keys, box, colors, litKey, column, width, bracketHeight, labelHeight],
  );
  const height = bracketHeight + labelHeight + box.height;
  return (
    <View style={{ width }}>
      <Text
        numberOfLines={1}
        style={[styles.name, { color: palette.chromeText }]}
      >
        {drumGroupName(group.id)}
      </Text>
      <View style={{ height }}>
        <ScoreCanvas
          commands={commands}
          style={[styles.canvas, { width, height }]}
        />
        <View style={[styles.entries, { marginTop: bracketHeight }]}>
          {group.entries.map(entry => (
            <Pressable
              key={entry.key}
              testID={`drum-key-${entry.key}`}
              onHoverIn={() => onLight(entry.key)}
              onHoverOut={() => onLight(undefined)}
              tooltip={`${drumEntryName(group, entry)}\n${drumEntryDetail(
                entry,
              )}`}
              accessibilityLabel={drumEntryName(group, entry)}
              style={{ width: column, height: labelHeight + box.height }}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.variant,
                  {
                    height: labelHeight,
                    color:
                      entry.key === litKey ? colors.lit : palette.chromeText,
                  },
                ]}
              >
                {drumVariantName(entry)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

export const DrumKeyColumn = memo(DrumKeyColumnView);

const styles = StyleSheet.create({
  // Fixed line heights: Korean names with a space are laid out a little lower otherwise (the Hangul word breaking).
  name: {
    fontSize: DRUM_KEY_LAYOUT.nameSize,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 3,
  },
  canvas: { position: 'absolute', left: 0, top: 0 },
  entries: { flexDirection: 'row' },
  variant: {
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
});
