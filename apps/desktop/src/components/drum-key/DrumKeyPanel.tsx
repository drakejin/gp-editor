import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import type { DrumKey } from '../../hooks/use-drum-key';
import { useT } from '../../hooks/use-i18n';
import { type DrumKeyGroup, WHOLE_KIT_KEYS, drumEntryDetail, drumEntryName, drumKeyGroups, trackDrumKeys } from '../../lib/drum-key';
import { DRUM_KEY_LAYOUT, layoutDrumKey } from '../../lib/drum-key-layout';
import { DRUM_KEY_STAFF, drumKeyColors } from '../../score/drum-key-staff';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { EDITION_PALETTE_WIDTH } from '../palette/EditionPalette';
import { DrumKeyColumn } from './DrumKeyColumn';

/** The card's room over the score (right of the edition palette, under the tab strip, to the window's edges) and its inner spacing. */
export const DRUM_KEY_PANEL = { top: 92, left: EDITION_PALETTE_WIDTH + 16, margin: 16, padding: 14, minWidth: 420 } as const;

interface DrumKeyPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The cursor's track: the key follows it (also in the multitrack view). */
  readonly trackIndex: number;
  readonly drumKey: DrumKey;
}

/** The text in the card's last line: the drum the mouse is over, or how to get it. */
function hoverLine(groups: readonly DrumKeyGroup[], litKey: number | undefined, fallback: string): string {
  const group = groups.find((candidate) => candidate.entries.some((entry) => entry.key === litKey));
  const entry = group?.entries.find((candidate) => candidate.key === litKey);
  return group === undefined || entry === undefined ? fallback : `${drumEntryName(group, entry)} — ${drumEntryDetail(entry)}`;
}

interface DrumKeyHeaderProps {
  readonly palette: Palette;
  readonly trackLabel: string;
  readonly isDrumTrack: boolean;
  readonly drumKey: DrumKey;
}

/** The card's title, the track it follows, Used drums / Whole kit and ×. */
function DrumKeyHeader({ palette, trackLabel, isDrumTrack, drumKey }: DrumKeyHeaderProps) {
  const t = useT();
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: palette.chromeText }]}>{t('drums.key.title')}</Text>
      <Text numberOfLines={1} style={[styles.track, { color: palette.chromeMuted }]}>
        {trackLabel}
      </Text>
      <ChromeButton palette={palette} label={t('drums.key.usedDrums')} tooltip={t('drums.key.usedDrumsTooltip')} isActive={isDrumTrack && !drumKey.showsWholeKit} isEnabled={isDrumTrack} onPress={() => drumKey.setShowsWholeKit(false)} />
      <ChromeButton palette={palette} label={t('drums.key.wholeKit')} tooltip={t('drums.key.wholeKitTooltip')} isActive={isDrumTrack && drumKey.showsWholeKit} isEnabled={isDrumTrack} onPress={() => drumKey.setShowsWholeKit(true)} />
      <ChromeButton palette={palette} label="✕" tooltip={t('drums.key.closeTooltip')} onPress={drumKey.close} />
    </View>
  );
}

interface DrumKeyRowsProps {
  readonly palette: Palette;
  readonly groups: readonly DrumKeyGroup[];
  readonly rows: ReturnType<typeof layoutDrumKey>;
  readonly litKey?: number;
  readonly onLight: (key: number | undefined) => void;
}

/** The columns, row by row, scrolling when they are taller than the window, and the drum under the mouse below them. */
function DrumKeyRows({ palette, groups, rows, litKey, onLight }: DrumKeyRowsProps) {
  const t = useT();
  const colors = useMemo(() => drumKeyColors(palette), [palette]);
  return (
    <>
      <ScrollView style={styles.body}>
        {rows.map((row) => (
          <View key={row.columns.map(({ group }) => group.id).join(' ')} style={styles.row}>
            {row.columns.map(({ group, width }) => (
              <DrumKeyColumn
                key={group.id}
                palette={palette}
                group={group}
                width={width}
                box={row.box}
                colors={colors}
                litKey={group.entries.some((entry) => entry.key === litKey) ? litKey : undefined}
                onLight={onLight}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <Text numberOfLines={1} style={[styles.hover, { color: palette.chromeMuted }]}>
        {hoverLine(groups, litKey, t('drums.key.pointAt'))}
      </Text>
    </>
  );
}

/** The card, `roomWidth` wide at most: its rows fill that width, the card shrinks to them. */
function DrumKeyCard({ palette, song, trackIndex, drumKey, roomWidth }: DrumKeyPanelProps & { readonly roomWidth: number }) {
  const t = useT();
  const [litKey, setLitKey] = useState<number | undefined>(undefined);
  const track = song.tracks[trackIndex];
  const isDrumTrack = track?.isPercussion === true;
  const keys = useMemo(() => (track === undefined || !isDrumTrack ? [] : drumKey.showsWholeKit ? WHOLE_KIT_KEYS : trackDrumKeys(track)), [track, isDrumTrack, drumKey.showsWholeKit]);
  const groups = useMemo(() => drumKeyGroups(keys), [keys]);
  const rows = useMemo(() => layoutDrumKey(groups, Math.max(DRUM_KEY_STAFF.column, roomWidth - 2 * DRUM_KEY_PANEL.padding)), [groups, roomWidth]);
  const width = Math.min(roomWidth, Math.max(DRUM_KEY_PANEL.minWidth, ...rows.map((row) => row.width + 2 * DRUM_KEY_PANEL.padding)));
  const message = !isDrumTrack ? t('drums.key.notDrums') : keys.length === 0 ? t('drums.key.noNotes') : undefined;
  const trackLabel = track === undefined ? '' : t('drums.key.trackLabel', { number: track.number, name: track.name });
  return (
    <View testID="drum-key-panel" style={[styles.card, { width, backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}>
      <DrumKeyHeader palette={palette} trackLabel={trackLabel} isDrumTrack={isDrumTrack} drumKey={drumKey} />
      {message === undefined ? (
        <DrumKeyRows palette={palette} groups={groups} rows={rows} litKey={litKey} onLight={setLitKey} />
      ) : (
        <Text style={[styles.message, { color: palette.chromeText }]}>{message}</Text>
      )}
    </View>
  );
}

/**
 * View ▸ Drum Key: a card over the score, as the reference's "DRUMSET" legend, naming how the cursor's drum track writes
 * each drum it uses (or Guitar Pro's whole kit): a column per element, each drum on a short staff drawn by the score's
 * own engraving. A non-drum track shows a hint instead. Closed by × or Esc (App's panel order). The room it may take is
 * measured (the window's size is not followed live on macOS); clicks beside the card reach the score.
 */
export function DrumKeyPanel(props: DrumKeyPanelProps) {
  const [roomWidth, setRoomWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setRoomWidth(event.nativeEvent.layout.width), []);
  return (
    <View style={styles.room} pointerEvents="box-none" onLayout={onLayout}>
      {roomWidth === 0 ? null : <DrumKeyCard {...props} roomWidth={roomWidth} />}
    </View>
  );
}

const styles = StyleSheet.create({
  room: { position: 'absolute', top: DRUM_KEY_PANEL.top, left: DRUM_KEY_PANEL.left, right: DRUM_KEY_PANEL.margin, bottom: DRUM_KEY_PANEL.margin, alignItems: 'flex-start' },
  card: { maxHeight: '100%', padding: DRUM_KEY_PANEL.padding, borderWidth: 1, borderRadius: 10 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginRight: 10 },
  track: { flex: 1, fontSize: 12, marginRight: 8 },
  body: { flexGrow: 0, flexShrink: 1 },
  row: { flexDirection: 'row', columnGap: DRUM_KEY_LAYOUT.gap, marginBottom: 12 },
  message: { fontSize: 12, lineHeight: 18, marginVertical: 6 },
  hover: { fontSize: 11, marginTop: 8 },
});
