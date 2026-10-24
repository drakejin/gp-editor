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

/** The eye's tooltip: the selected track is always shown; another is shown or hidden by its eye. */
function eyeTooltip(isSelected: boolean, isShown: boolean): string {
  if (isSelected) {
    return 'Shown in the score: the selected track always is';
  }
  return isShown ? 'Shown in the score (click to hide)' : 'Show in the score (Multitrack)';
}

/** Eye (shown in the score), mute and solo. */
function TrackToggles({ track, trackIndex, isSelected, isShown, palette, onToggleShown, onSetTrackMute, onSetTrackSolo }: TrackMixerRowProps) {
  const eye = useMemo(() => engraveEyeIcon(isShown ? palette.chromeText : palette.chromeMuted), [isShown, palette]);
  const speaker = useMemo(() => engraveSpeakerIcon(track.mute ? palette.chromeAccentText : palette.chromeMuted, track.mute), [track.mute, palette]);
  const headphones = useMemo(() => engraveHeadphonesIcon(track.solo ? palette.chromeAccentText : palette.chromeMuted), [track.solo, palette]);
  const number = track.number;
  return (
    <View style={styles.toggles}>
      <PanelIconButton
        commands={eye}
        accessibilityLabel={`Show track ${number} in the score`}
        tooltip={eyeTooltip(isSelected, isShown)}
        isChecked={isShown}
        palette={palette}
        onPress={() => onToggleShown(trackIndex)}
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
  /** View ▸ Multitrack (F3), lit while on. */
  readonly isMultitrack?: boolean;
  readonly onToggleMultitrack?: () => void;
  /** Guitar Pro's "Audio track" button (the song has none yet). */
  readonly onAddAudioTrack?: () => void;
}

/** "Tracks" over the table, Multitrack, and the mixer columns named, as tall as the bar numbers beside it. */
export function TrackTableHeader({ palette, isMultitrack = false, onToggleMultitrack }: TrackTableBandProps) {
  const caption = [styles.caption, { color: palette.chromeMuted }];
  return (
    <View style={[styles.band, { height: BAR_MAP.headerHeight, backgroundColor: palette.chromeDeep }]}>
      <Text style={[styles.title, { color: palette.chromeText }]}>Tracks</Text>
      {onToggleMultitrack === undefined ? null : (
        <Pressable
          testID="tracks-panel-multitrack"
          onPress={onToggleMultitrack}
          tooltip="Multitrack: every track in the score (F3)"
          accessibilityRole="button"
          accessibilityLabel="Multitrack: every track in the score (F3)"
          accessibilityState={{ selected: isMultitrack }}
          style={[styles.toggle, isMultitrack ? { backgroundColor: palette.chromeAccent } : { borderColor: palette.chromeMuted }]}
        >
          <Text style={[styles.caption, { color: isMultitrack ? palette.chromeAccentText : palette.chromeText }]}>Multitrack</Text>
        </Pressable>
      )}
      <Text style={[caption, { width: TRACK_TABLE.volumeWidth }]}>Volume</Text>
      <View style={styles.gap} />
      <Text style={[caption, { width: TRACK_TABLE.panWidth }]}>Pan</Text>
    </View>
  );
}

/** Beside the sections row of the bar map; "+ Audio Track" while the song has none. */
export function TrackTableFooter({ palette, onAddAudioTrack }: TrackTableBandProps) {
  return (
    <View style={[styles.band, { height: BAR_MAP.sectionsHeight, backgroundColor: palette.chromeDeep }]}>
      <Text style={[styles.caption, styles.sections, { color: palette.chromeMuted }]}>Sections</Text>
      {onAddAudioTrack === undefined ? null : (
        <Pressable
          testID="tracks-panel-add-audio-track"
          onPress={onAddAudioTrack}
          tooltip="Add a recording that plays in sync with the score (Track ▸ Add Audio Track…)"
          accessibilityRole="button"
          accessibilityLabel="Add an audio track"
        >
          <Text style={[styles.caption, { color: palette.chromeText }]}>+ Audio Track</Text>
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
  toggles: { flexDirection: 'row', gap: TRACK_TABLE.toggleGap, marginRight: TRACK_TABLE.columnGap },
  gap: { width: TRACK_TABLE.columnGap },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  icon: { width: PANEL_ICON_SIZE, height: PANEL_ICON_SIZE },
});
