import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel, Track } from '@gp-editor/core';
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
  /** The track shown in the score. */
  readonly isSelected: boolean;
  readonly palette: Palette;
  readonly onSelectTrack: (trackIndex: number) => void;
  readonly onSetTrackMute: (trackIndex: number, isMute: boolean) => void;
  readonly onSetTrackSolo: (trackIndex: number, isSolo: boolean) => void;
  readonly onSetTrackVolume: (trackIndex: number, volume: number) => void;
  readonly onSetTrackBalance: (trackIndex: number, balance: number) => void;
  readonly onEditInstrument: (trackIndex: number) => void;
}

/** One track of the table: instrument icon, "1. Name", show / mute / solo, volume and pan. */
function TrackMixerRowView(props: TrackMixerRowProps) {
  const { track, trackIndex, isSelected, palette } = props;
  const number = track.number;
  const name = track.name.trim() === '' ? 'Untitled' : track.name;
  const isDrums = props.iconKind === 'drums';
  const instrumentIcon = useMemo(() => engraveInstrumentIcon(props.iconKind, visibleTrackColor(track.color)), [props.iconKind, track.color]);
  return (
    <View style={[styles.row, { borderBottomColor: palette.chromeBorder }, isSelected ? { backgroundColor: selectedRowColor(palette) } : null]}>
      <PanelIconButton
        commands={instrumentIcon}
        size={TRACK_TABLE.instrumentBox}
        accessibilityLabel={`Instrument of track ${number}`}
        tooltip={isDrums ? 'Drums' : `${props.instrumentName ?? 'Instrument'} (click to change)`}
        isEnabled={!isDrums}
        palette={palette}
        onPress={() => props.onEditInstrument(trackIndex)}
      />
      <Pressable
        onPress={() => props.onSelectTrack(trackIndex)}
        tooltip={props.instrumentName === undefined ? name : `${name}: ${props.instrumentName}`}
        accessibilityRole="button"
        accessibilityLabel={`Track ${number}: ${name}`}
        style={styles.name}
      >
        <Text numberOfLines={1} style={[styles.nameText, { color: palette.chromeText }, isSelected ? styles.selectedName : null]}>
          {`${number}. ${name}`}
        </Text>
      </Pressable>
      <TrackToggles {...props} />
      <TrackSliders {...props} />
    </View>
  );
}

export const TrackMixerRow = memo(TrackMixerRowView);

/** Volume and pan of the track's channel; stable callbacks keep the memoized sliders from re-rendering. */
function TrackSliders({ track, trackIndex, channel, palette, onSetTrackVolume, onSetTrackBalance }: TrackMixerRowProps) {
  const setVolume = useCallback((volume: number) => onSetTrackVolume(trackIndex, volume), [onSetTrackVolume, trackIndex]);
  const setBalance = useCallback((balance: number) => onSetTrackBalance(trackIndex, balance), [onSetTrackBalance, trackIndex]);
  const isEnabled = channel !== undefined;
  return (
    <>
      <MixerSlider
        value={channel?.volume ?? MIXER.max}
        width={TRACK_TABLE.volumeWidth}
        label="Volume"
        accessibilityLabel={`Volume of track ${track.number}`}
        isEnabled={isEnabled}
        palette={palette}
        onChange={setVolume}
      />
      <View style={styles.gap} />
      <MixerSlider
        value={channel?.balance ?? MIXER.centre}
        width={TRACK_TABLE.panWidth}
        label="Pan"
        accessibilityLabel={`Pan of track ${track.number}`}
        isCentred
        isEnabled={isEnabled}
        palette={palette}
        onChange={setBalance}
      />
    </>
  );
}

/** Eye (the track the score shows), mute and solo. */
function TrackToggles({ track, trackIndex, isSelected, palette, onSelectTrack, onSetTrackMute, onSetTrackSolo }: TrackMixerRowProps) {
  const eye = useMemo(() => engraveEyeIcon(isSelected ? palette.chromeText : palette.chromeMuted), [isSelected, palette]);
  const speaker = useMemo(() => engraveSpeakerIcon(track.mute ? palette.chromeAccentText : palette.chromeMuted, track.mute), [track.mute, palette]);
  const headphones = useMemo(() => engraveHeadphonesIcon(track.solo ? palette.chromeAccentText : palette.chromeMuted), [track.solo, palette]);
  const number = track.number;
  return (
    <View style={styles.toggles}>
      <PanelIconButton
        commands={eye}
        accessibilityLabel={`Show track ${number} in the score`}
        tooltip={isSelected ? 'Shown in the score' : 'Show in the score'}
        isChecked={isSelected}
        palette={palette}
        onPress={() => onSelectTrack(trackIndex)}
      />
      <PanelIconButton
        commands={speaker}
        accessibilityLabel={`Mute track ${number}`}
        tooltip={track.mute ? 'Muted (click to unmute)' : 'Mute'}
        isChecked={track.mute}
        isHighlighted={track.mute}
        palette={palette}
        onPress={() => onSetTrackMute(trackIndex, !track.mute)}
      />
      <PanelIconButton
        commands={headphones}
        accessibilityLabel={`Solo track ${number}`}
        tooltip={track.solo ? 'Solo (click to stop)' : 'Solo'}
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
}

/** "Tracks" over the table, with the mixer columns named, as tall as the bar numbers beside it. */
export function TrackTableHeader({ palette }: TrackTableBandProps) {
  const caption = [styles.caption, { color: palette.chromeMuted }];
  return (
    <View style={[styles.band, { height: BAR_MAP.headerHeight, backgroundColor: palette.chromeDeep }]}>
      <Text style={[styles.title, { color: palette.chromeText }]}>Tracks</Text>
      <Text style={[caption, { width: TRACK_TABLE.volumeWidth }]}>Volume</Text>
      <View style={styles.gap} />
      <Text style={[caption, { width: TRACK_TABLE.panWidth }]}>Pan</Text>
    </View>
  );
}

/** Beside the sections row of the bar map. */
export function TrackTableFooter({ palette }: TrackTableBandProps) {
  return (
    <View style={[styles.band, { height: BAR_MAP.sectionsHeight, backgroundColor: palette.chromeDeep }]}>
      <Text style={[styles.caption, { color: palette.chromeMuted }]}>Sections</Text>
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
  name: { flex: 1, height: BAR_MAP.rowHeight, justifyContent: 'center', marginLeft: 6, marginRight: 4 },
  nameText: { fontSize: 12 },
  selectedName: { fontWeight: '700' },
  toggles: { flexDirection: 'row', gap: TRACK_TABLE.toggleGap, marginRight: TRACK_TABLE.columnGap },
  gap: { width: TRACK_TABLE.columnGap },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  icon: { width: PANEL_ICON_SIZE, height: PANEL_ICON_SIZE },
});
