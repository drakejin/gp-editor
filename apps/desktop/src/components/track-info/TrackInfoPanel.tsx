import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Rgb, type Song, abbreviateTrackName } from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import type { PanelAnchor } from '../../hooks/use-track-info';
import { trackInstrument } from '../../lib/instruments';
import { shownTrackIcon } from '../../score/track-icons';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { InspectorTextField } from '../inspector/InspectorParts';
import { TrackIcon } from '../TrackIcon';
import { TrackColorPicker } from './TrackColorPicker';
import { TrackIconPicker } from './TrackIconPicker';

/**
 * The panel's size (its height as laid out, for placing it above the control) and its distances, in points: from the
 * window's edges, from the control (`anchorHeight` below its top when it opens under it).
 */
export const TRACK_INFO = { width: 312, height: 424, margin: 8, gap: 8, anchorHeight: 24 } as const;

/** The edits the panel makes, each one undo step. */
export interface TrackInfoCommands {
  readonly onSetTrackName: (trackIndex: number, name: string) => void;
  readonly onSetTrackShortName: (trackIndex: number, shortName: string) => void;
  readonly onSetTrackColor: (trackIndex: number, color: Rgb) => void;
  /** undefined: the instrument's icon again. */
  readonly onSetTrackIcon: (trackIndex: number, iconId: number | undefined) => void;
}

export interface TrackInfoPanelProps extends TrackInfoCommands {
  readonly palette: Palette;
  readonly song: Song;
  readonly trackIndex: number;
  /** The top-left corner of the control that opened it, in the window's layout points. */
  readonly anchor: PanelAnchor;
  readonly windowWidth: number;
  /** Instrument…: the instrument picker (the panel closes). */
  readonly onEditInstrument: (trackIndex: number) => void;
  /** ✕, Esc, a click outside. */
  readonly onClose: () => void;
}

/**
 * Where the panel goes: above the control when there is room (the tracks panel is at the bottom), else under it; from
 * the control's left edge, inside the window.
 */
export function trackInfoPlacement(anchor: PanelAnchor, windowWidth: number): { readonly left: number; readonly top: number } {
  const widest = Math.max(TRACK_INFO.margin, windowWidth - TRACK_INFO.width - TRACK_INFO.margin);
  const left = Math.min(Math.max(TRACK_INFO.margin, anchor.x), widest);
  const above = anchor.y - TRACK_INFO.height - TRACK_INFO.gap;
  return { left, top: above >= TRACK_INFO.margin ? above : anchor.y + TRACK_INFO.anchorHeight + TRACK_INFO.gap };
}

/**
 * Guitar Pro 8's track information (its Track inspector's INFORMATION row: colour, icon, name, short name) in a small
 * panel beside the control that opened it: Guitar Pro 8's track colours and any colour typed, its icons, the instrument's icon again,
 * and the instrument picker. Every change is made at once, one undo step each.
 */
export function TrackInfoPanel(props: TrackInfoPanelProps) {
  const { palette, song, trackIndex, onClose } = props;
  const t = useT();
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return null;
  }
  const placement = trackInfoPlacement(props.anchor, props.windowWidth);
  return (
    <View style={styles.overlay}>
      <Pressable testID="track-info-backdrop" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        testID="track-info-panel"
        accessibilityLabel={t('window.trackInfo.title')}
        style={[styles.panel, placement, { backgroundColor: palette.chrome, borderColor: palette.chromeBorder }]}
      >
        <Header {...props} />
        <InspectorTextField palette={palette} label={t('common.name')} value={track.name} onCommit={(name) => props.onSetTrackName(trackIndex, name)} />
        <InspectorTextField
          palette={palette}
          label={t('window.trackInfo.shortName')}
          value={track.shortName ?? ''}
          placeholder={abbreviateTrackName(track.name)}
          onCommit={(shortName) => props.onSetTrackShortName(trackIndex, shortName)}
        />
        <Text style={[styles.section, { color: palette.chromeText }]}>{t('window.trackInfo.color')}</Text>
        <TrackColorPicker palette={palette} color={track.color} onChange={(color) => props.onSetTrackColor(trackIndex, color)} />
        <Text style={[styles.section, { color: palette.chromeText }]}>{t('window.trackInfo.icon')}</Text>
        <TrackIconPicker palette={palette} icon={shownTrackIcon(song, trackIndex)} onChange={(iconId) => props.onSetTrackIcon(trackIndex, iconId)} />
        <Footer {...props} isFollowingInstrument={track.iconId === undefined} isPercussion={track.isPercussion} />
      </View>
    </View>
  );
}

/** The track's icon, "2. Bass", its instrument, ✕. */
function Header({ palette, song, trackIndex, onClose }: TrackInfoPanelProps) {
  const t = useT();
  const track = song.tracks[trackIndex];
  const name = track === undefined || track.name.trim() === '' ? t('common.untitled') : track.name;
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: palette.chromeText }]}>{t('window.trackInfo.title')}</Text>
      <ChromeButton palette={palette} label="✕" tooltip={t('window.trackInfo.close')} onPress={onClose} />
      <View style={styles.trackRow}>
        <TrackIcon icon={shownTrackIcon(song, trackIndex)} color={palette.chromeText} />
        <Text numberOfLines={1} style={[styles.trackName, { color: palette.chromeText }]}>
          {t('common.trackNumbered', { number: track?.number ?? trackIndex + 1, name })}
        </Text>
        <Text numberOfLines={1} style={[styles.instrument, { color: palette.chromeMuted }]}>
          {trackInstrument(song, trackIndex)?.name ?? ''}
        </Text>
      </View>
    </View>
  );
}

/** The instrument's icon again, the instrument picker, what the files keep. */
function Footer(props: TrackInfoPanelProps & { readonly isFollowingInstrument: boolean; readonly isPercussion: boolean }) {
  const { palette, trackIndex, isFollowingInstrument, isPercussion } = props;
  const t = useT();
  const editInstrument = () => {
    props.onClose();
    props.onEditInstrument(trackIndex);
  };
  return (
    <>
      <View style={styles.buttons}>
        <ChromeButton
          palette={palette}
          label={t('window.trackInfo.instrumentIcon')}
          tooltip={t('window.trackInfo.instrumentIconTooltip')}
          isActive={isFollowingInstrument}
          onPress={() => props.onSetTrackIcon(trackIndex, undefined)}
        />
        <View style={styles.spacer} />
        <ChromeButton
          palette={palette}
          label={t('window.trackInfo.instrument')}
          tooltip={isPercussion ? t('window.trackInfo.drumsInstrument') : t('window.trackInfo.instrumentTooltip')}
          isEnabled={!isPercussion}
          onPress={editInstrument}
        />
      </View>
      <Text style={[styles.note, { color: palette.chromeMuted }]}>{t('window.trackInfo.note')}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  panel: { position: 'absolute', width: TRACK_INFO.width, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 },
  title: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  trackRow: { width: '100%', flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  trackName: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  instrument: { fontSize: 11, flexShrink: 1, marginLeft: 'auto' },
  section: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginTop: 8, marginBottom: 6 },
  buttons: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  spacer: { flex: 1 },
  note: { fontSize: 10, marginTop: 8, lineHeight: 14 },
});
