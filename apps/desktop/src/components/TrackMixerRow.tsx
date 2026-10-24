import { type ReactNode, memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel, Track } from '@gp-editor/core';
import { type Translate, useT } from '../hooks/use-i18n';
import { ScoreCanvas } from '../native/score-canvas';
import { BAR_MAP, selectedRowColor, visibleTrackColor } from '../score/bar-map';
import type { DrawCommand } from '../score/draw';
import {
  type InstrumentIconKind,
  PANEL_ICON_SIZE,
  engraveEyeIcon,
  engraveHeadphonesIcon,
  engraveInstrumentIcon,
  engraveSpeakerIcon,
} from '../score/panel-icons';
import type { Palette } from '../theme';
import { MIXER, MixerSlider } from './MixerSlider';
import { useTrackRowDrag } from './track-row-drag';

/** Columns of the track table, left of the bar map; rows are as tall as the bar map's (BAR_MAP.rowHeight). */
export const TRACK_TABLE = {
  width: 360,
  padding: 8,
  instrumentBox: 20,
  toggleBox: 18,
  toggleGap: 2,
  volumeWidth: 70,
  panWidth: 44,
  columnGap: 8,
} as const;

export interface TrackMixerRowProps {
  readonly track: Track;
  readonly trackIndex: number;
  /** The track's channel (volume, pan); the sliders are disabled without one. */
  readonly channel?: Channel;
  /** General MIDI instrument name (or "Drums"), for the tooltips. */
  readonly instrumentName?: string;
  readonly iconKind: InstrumentIconKind;
  /** The selected track (the cursor's, the inspector's). */
  readonly isSelected: boolean;
  /** The score shows the track: the selected one, or one the multitrack view shows. */
  readonly isShown: boolean;
  readonly palette: Palette;
  readonly onSelectTrack: (trackIndex: number) => void;
  /** The eye: the track shown or hidden in the multitrack view. */
  readonly onToggleShown: (trackIndex: number) => void;
  readonly onSetTrackMute: (trackIndex: number, isMute: boolean) => void;
  readonly onSetTrackSolo: (trackIndex: number, isSolo: boolean) => void;
  readonly onSetTrackVolume: (trackIndex: number, volume: number) => void;
  readonly onSetTrackBalance: (trackIndex: number, balance: number) => void;
  readonly onEditInstrument: (trackIndex: number) => void;
  /** Tracks in the table: how far a drag of the name can move the track. */
  readonly trackCount?: number;
  /** The row being dragged to another place (drawn dimmed). */
  readonly isDragged?: boolean;
  /** While the name is dragged: where the track would go (undefined when the drag ends). */
  readonly onDragTrack?: (fromIndex: number, toIndex: number | undefined) => void;
  /** The name was dragged to another row: the track moves there (one undo step). */
  readonly onMoveTrack?: (fromIndex: number, toIndex: number) => void;
}

/** One track of the table: instrument icon, "1. Name", show / mute / solo, volume and pan. */
function TrackMixerRowView(props: TrackMixerRowProps) {
  const { track, trackIndex, isSelected, palette } = props;
  const t = useT();
  const number = track.number;
  const name = track.name.trim() === '' ? t('common.untitled') : track.name;
  const isDrums = props.iconKind === 'drums';
  const instrumentIcon = useMemo(() => engraveInstrumentIcon(props.iconKind, visibleTrackColor(track.color)), [props.iconKind, track.color]);
  const drag = useTrackRowDrag(trackIndex, props.trackCount ?? 1, { onSelect: props.onSelectTrack, onDragOver: props.onDragTrack, onDrop: props.onMoveTrack });
  return (
    <View
      style={[styles.row, { borderBottomColor: palette.chromeBorder }, isSelected ? { backgroundColor: selectedRowColor(palette) } : null, props.isDragged === true ? styles.dragged : null]}
    >
      <PanelIconButton
        commands={instrumentIcon}
        size={TRACK_TABLE.instrumentBox}
        accessibilityLabel={t('window.tracks.instrumentOf', { number })}
        tooltip={isDrums ? t('window.tracks.drums') : t('window.tracks.instrumentTooltip', { instrument: props.instrumentName ?? t('common.instrument') })}
        isEnabled={!isDrums}
        palette={palette}
        onPress={() => props.onEditInstrument(trackIndex)}
      />
      <Pressable
        {...drag}
        tooltip={nameTooltip(name, props.instrumentName, props.onMoveTrack !== undefined, t)}
        accessibilityRole="button"
        accessibilityLabel={t('window.tracks.trackLabel', { number, name })}
        style={styles.name}
      >
        <Text numberOfLines={1} style={[styles.nameText, { color: palette.chromeText }, isSelected ? styles.selectedName : null]}>
          {t('common.trackNumbered', { number, name })}
        </Text>
      </Pressable>
      <TrackToggles {...props} />
      <TrackSliders {...props} />
    </View>
  );
}

export const TrackMixerRow = memo(TrackMixerRowView);

/** The name's tooltip: the name and its instrument, and how to move the track when it can be dragged. */
function nameTooltip(name: string, instrumentName: string | undefined, canDrag: boolean, t: Translate): string {
  const named = instrumentName === undefined ? name : t('window.tracks.nameWithInstrument', { name, instrument: instrumentName });
  return canDrag ? t('window.tracks.dragToMove', { name: named }) : named;
}

/** Volume and pan of the track's channel; stable callbacks keep the memoized sliders from re-rendering. */
function TrackSliders({ track, trackIndex, channel, palette, onSetTrackVolume, onSetTrackBalance }: TrackMixerRowProps) {
  const setVolume = useCallback((volume: number) => onSetTrackVolume(trackIndex, volume), [onSetTrackVolume, trackIndex]);
  const setBalance = useCallback((balance: number) => onSetTrackBalance(trackIndex, balance), [onSetTrackBalance, trackIndex]);
  const t = useT();
  const isEnabled = channel !== undefined;
  return (
    <>
      <MixerSlider
        value={channel?.volume ?? MIXER.max}
        width={TRACK_TABLE.volumeWidth}
        label={t('common.volume')}
        accessibilityLabel={t('window.tracks.volumeOf', { number: track.number })}
        isEnabled={isEnabled}
        palette={palette}
        onChange={setVolume}
      />
      <View style={styles.gap} />
      <MixerSlider
        value={channel?.balance ?? MIXER.centre}
        width={TRACK_TABLE.panWidth}
        label={t('window.tracks.pan')}
        accessibilityLabel={t('window.tracks.panOf', { number: track.number })}
        isCentred
        isEnabled={isEnabled}
        palette={palette}
        onChange={setBalance}
      />
    </>
  );
}

/** The eye's tooltip: the selected track is always shown; another is shown or hidden by its eye. */
function eyeTooltip(isSelected: boolean, isShown: boolean, t: Translate): string {
  if (isSelected) {
    return t('window.tracks.eyeSelected');
  }
  return isShown ? t('window.tracks.eyeShown') : t('window.tracks.eyeHidden');
}

/** Eye (shown in the score), mute and solo. */
function TrackToggles({ track, trackIndex, isSelected, isShown, palette, onToggleShown, onSetTrackMute, onSetTrackSolo }: TrackMixerRowProps) {
  const eye = useMemo(() => engraveEyeIcon(isShown ? palette.chromeText : palette.chromeMuted), [isShown, palette]);
  const speaker = useMemo(() => engraveSpeakerIcon(track.mute ? palette.chromeAccentText : palette.chromeMuted, track.mute), [track.mute, palette]);
  const headphones = useMemo(() => engraveHeadphonesIcon(track.solo ? palette.chromeAccentText : palette.chromeMuted), [track.solo, palette]);
  const number = track.number;
  const t = useT();
  return (
    <View style={styles.toggles}>
      <PanelIconButton
        commands={eye}
        accessibilityLabel={t('window.tracks.showOf', { number })}
        tooltip={eyeTooltip(isSelected, isShown, t)}
        isChecked={isShown}
        palette={palette}
        onPress={() => onToggleShown(trackIndex)}
      />
      <PanelIconButton
        commands={speaker}
        accessibilityLabel={t('window.tracks.muteOf', { number })}
        tooltip={track.mute ? t('window.tracks.muted') : t('common.mute')}
        isChecked={track.mute}
        isHighlighted={track.mute}
        palette={palette}
        onPress={() => onSetTrackMute(trackIndex, !track.mute)}
      />
      <PanelIconButton
        commands={headphones}
        accessibilityLabel={t('window.tracks.soloOf', { number })}
        tooltip={track.solo ? t('window.tracks.soloed') : t('common.solo')}
        isChecked={track.solo}
        isHighlighted={track.solo}
        palette={palette}
        onPress={() => onSetTrackSolo(trackIndex, !track.solo)}
      />
    </View>
  );
}

interface PanelIconButtonProps {
  /** An icon of PANEL_ICON_SIZE, drawn centred. */
  readonly commands: readonly DrawCommand[];
  readonly accessibilityLabel: string;
  readonly tooltip: string;
  readonly palette: Palette;
  readonly onPress: () => void;
  readonly size?: number;
  readonly isEnabled?: boolean;
  /** Set for an on/off switch (VoiceOver reads its state). */
  readonly isChecked?: boolean;
  /** Drawn on the accent colour (mute and solo when on). */
  readonly isHighlighted?: boolean;
}

/** A small icon button of the panel, its icon drawn by the native canvas. */
export function PanelIconButton(props: PanelIconButtonProps) {
  const { size = TRACK_TABLE.toggleBox, isEnabled = true, isChecked, palette } = props;
  return (
    <Pressable
      disabled={!isEnabled}
      onPress={props.onPress}
      tooltip={props.tooltip}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole={isChecked === undefined ? 'button' : 'switch'}
      accessibilityState={isChecked === undefined ? { disabled: !isEnabled } : { checked: isChecked, disabled: !isEnabled }}
      style={[styles.iconButton, { width: size, height: size }, props.isHighlighted === true ? { backgroundColor: palette.chromeAccent } : null]}
    >
      <ScoreCanvas commands={props.commands} style={styles.icon} />
    </Pressable>
  );
}

interface TrackTableBandProps {
  readonly palette: Palette;
  /** View ▸ Multitrack (F3), lit while on. */
  readonly isMultitrack?: boolean;
  readonly onToggleMultitrack?: () => void;
  /** Guitar Pro's "Audio track" button (the song has none yet). */
  readonly onAddAudioTrack?: () => void;
}

/** "Tracks" over the table, Multitrack, and the mixer columns named, as tall as the bar numbers beside it. */
export function TrackTableHeader({ palette, isMultitrack = false, onToggleMultitrack }: TrackTableBandProps) {
  const t = useT();
  const caption = [styles.caption, { color: palette.chromeMuted }];
  return (
    <View style={[styles.band, { height: BAR_MAP.headerHeight, backgroundColor: palette.chromeDeep }]}>
      <Text style={[styles.title, { color: palette.chromeText }]}>{t('window.tracks.title')}</Text>
      {onToggleMultitrack === undefined ? null : (
        <Pressable
          testID="tracks-panel-multitrack"
          onPress={onToggleMultitrack}
          tooltip={t('window.tracks.multitrackTooltip')}
          accessibilityRole="button"
          accessibilityLabel={t('window.tracks.multitrackTooltip')}
          accessibilityState={{ selected: isMultitrack }}
          style={[styles.toggle, isMultitrack ? { backgroundColor: palette.chromeAccent } : { borderColor: palette.chromeMuted }]}
        >
          <Text style={[styles.caption, { color: isMultitrack ? palette.chromeAccentText : palette.chromeText }]}>{t('window.export.multitrack')}</Text>
        </Pressable>
      )}
      <Text style={[caption, { width: TRACK_TABLE.volumeWidth }]}>{t('common.volume')}</Text>
      <View style={styles.gap} />
      <Text style={[caption, { width: TRACK_TABLE.panWidth }]}>{t('window.tracks.pan')}</Text>
    </View>
  );
}

interface TrackTableFooterProps extends TrackTableBandProps {
  /** The track buttons (+, duplicate, delete, move up / down), beside "+ Audio Track". */
  readonly trackActions?: ReactNode;
}

/** Beside the sections row of the bar map: the track buttons, and "+ Audio Track" while the song has none. */
export function TrackTableFooter({ palette, onAddAudioTrack, trackActions }: TrackTableFooterProps) {
  const t = useT();
  return (
    <View style={[styles.band, { height: BAR_MAP.sectionsHeight, backgroundColor: palette.chromeDeep }]}>
      <Text style={[styles.caption, styles.sections, { color: palette.chromeMuted }]}>{t('window.tracks.sections')}</Text>
      {trackActions}
      {onAddAudioTrack === undefined ? null : (
        <Pressable
          testID="tracks-panel-add-audio-track"
          onPress={onAddAudioTrack}
          tooltip={t('window.tracks.addAudioTooltip')}
          accessibilityRole="button"
          accessibilityLabel={t('window.tracks.addAudioAccessibility')}
        >
          <Text style={[styles.caption, { color: palette.chromeText }]}>{t('window.tracks.addAudio')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: BAR_MAP.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TRACK_TABLE.padding,
    borderBottomWidth: 1,
  },
  band: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: TRACK_TABLE.padding },
  title: { flex: 1, fontSize: 11, fontWeight: '700' },
  caption: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  sections: { flex: 1, textAlign: 'left' },
  toggle: { height: 16, paddingHorizontal: 6, marginRight: TRACK_TABLE.columnGap, borderRadius: 4, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  name: { flex: 1, height: BAR_MAP.rowHeight, justifyContent: 'center', marginLeft: 6, marginRight: 4 },
  nameText: { fontSize: 12 },
  selectedName: { fontWeight: '700' },
  dragged: { opacity: 0.45 },
  toggles: { flexDirection: 'row', gap: TRACK_TABLE.toggleGap, marginRight: TRACK_TABLE.columnGap },
  gap: { width: TRACK_TABLE.columnGap },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  icon: { width: PANEL_ICON_SIZE, height: PANEL_ICON_SIZE },
});
