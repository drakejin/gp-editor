import { type ReactNode, type Ref, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, type KeyEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel, Track, TrackIconName } from '@gp-editor/core';
import { type Translate, useT } from '../hooks/use-i18n';
import { type PanelAnchor, useAnchoredPress } from '../hooks/use-track-info';
import { ScoreCanvas } from '../native/score-canvas';
import { BAR_MAP, selectedRowColor, visibleTrackColor } from '../score/bar-map';
import type { DrawCommand } from '../score/draw';
import { PANEL_ICON_SIZE, engraveEyeIcon, engraveHeadphonesIcon, engraveSpeakerIcon } from '../score/panel-icons';
import { engraveTrackIcon } from '../score/track-icons';
import type { Palette } from '../theme';
import { MIXER, MixerSlider } from './MixerSlider';
import { TextField } from './TextField';
import { useTrackRowDrag } from './track-row-drag';

/** Columns of the track table, left of the bar map; rows are as tall as the bar map's (BAR_MAP.rowHeight). */
export const TRACK_TABLE = {
  width: 360,
  padding: 8,
  /** Guitar Pro's colour strip at the row's left edge. */
  colorStrip: 5,
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
  /** The track's icon (gp-core's track icon, else its instrument's). */
  readonly icon: TrackIconName;
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
  /** The track's colour strip or icon was clicked: its track information opens beside it. */
  readonly onOpenTrackInfo?: (trackIndex: number, anchor: PanelAnchor) => void;
  /** A name typed in place (double-click the name, or ✎ on the selected row): Return or leaving the field sets it. */
  readonly onRenameTrack?: (trackIndex: number, name: string) => void;
  /** The name's field went (Return, Esc, leaving it): the keyboard goes back to the score. */
  readonly onRenameEnd?: () => void;
  /** Tracks in the table: how far a drag of the name can move the track. */
  readonly trackCount?: number;
  /** The row being dragged to another place (drawn dimmed). */
  readonly isDragged?: boolean;
  /** While the name is dragged: where the track would go (undefined when the drag ends). */
  readonly onDragTrack?: (fromIndex: number, toIndex: number | undefined) => void;
  /** The name was dragged to another row: the track moves there (one undo step). */
  readonly onMoveTrack?: (fromIndex: number, toIndex: number) => void;
}

/** One track of the table: Guitar Pro's colour strip, icon, "1. Name" (renamed in place), show / mute / solo, volume and pan. */
function TrackMixerRowView(props: TrackMixerRowProps) {
  const { track, trackIndex, isSelected, palette, onOpenTrackInfo, onRenameTrack } = props;
  const t = useT();
  const number = track.number;
  const iconCommands = useMemo(() => engraveTrackIcon(props.icon, palette.chromeText), [props.icon, palette.chromeText]);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const startRename = useCallback(() => setDraft(track.name), [track.name]);
  // A track edit while the name is typed (an undo from the menu, a track moved): the row may show another track now.
  useEffect(() => setDraft(undefined), [track.measures]);
  const finishRename = (name: string | undefined) => {
    setDraft(undefined);
    if (name !== undefined && name.trim() !== '' && name.trim() !== track.name) {
      onRenameTrack?.(trackIndex, name);
    }
    props.onRenameEnd?.();
  };
  const openInfo = onOpenTrackInfo === undefined ? undefined : (anchor: PanelAnchor) => onOpenTrackInfo(trackIndex, anchor);
  const strip = useAnchoredPress(openInfo);
  const icon = useAnchoredPress(openInfo);
  return (
    <View
      style={[styles.row, { borderBottomColor: palette.chromeBorder }, isSelected ? { backgroundColor: selectedRowColor(palette) } : null, props.isDragged === true ? styles.dragged : null]}
    >
      <Pressable
        ref={strip.ref}
        disabled={strip.onPress === undefined}
        onPress={strip.onPress}
        tooltip={t('window.tracks.colorTooltip')}
        accessibilityRole="button"
        accessibilityLabel={t('window.tracks.colorOf', { number })}
        style={[styles.colorStrip, { backgroundColor: visibleTrackColor(track.color) }]}
      />
      <PanelIconButton
        commands={iconCommands}
        size={TRACK_TABLE.instrumentBox}
        accessibilityLabel={t('window.tracks.iconOf', { number })}
        tooltip={t('window.tracks.iconTooltip', { icon: t(`window.trackIcon.${props.icon}`) })}
        isEnabled={icon.onPress !== undefined}
        palette={palette}
        pressableRef={icon.ref}
        onPress={(event) => icon.onPress?.(event)}
      />
      {draft === undefined || onRenameTrack === undefined ? (
        <TrackName {...props} onStartRename={onRenameTrack === undefined ? undefined : startRename} />
      ) : (
        <RenameField palette={palette} number={number} draft={draft} onChange={setDraft} onDone={finishRename} />
      )}
      <TrackToggles {...props} />
      <TrackSliders {...props} />
    </View>
  );
}

/** The name: a click shows the track, a drag moves it, a double-click (or ✎ on the selected row) renames it. */
function TrackName(props: TrackMixerRowProps & { readonly onStartRename?: () => void }) {
  const { track, trackIndex, isSelected, palette, onStartRename } = props;
  const t = useT();
  const number = track.number;
  const name = track.name.trim() === '' ? t('common.untitled') : track.name;
  const drag = useTrackRowDrag(trackIndex, props.trackCount ?? 1, { onSelect: props.onSelectTrack, onDragOver: props.onDragTrack, onDrop: props.onMoveTrack });
  return (
    <>
      <Pressable
        {...drag}
        onDoubleClick={onStartRename}
        tooltip={nameTooltip(name, props.instrumentName, props.onMoveTrack !== undefined, t)}
        accessibilityRole="button"
        accessibilityLabel={t('window.tracks.trackLabel', { number, name })}
        style={styles.name}
      >
        <Text numberOfLines={1} style={[styles.nameText, { color: palette.chromeText }, isSelected ? styles.selectedName : null]}>
          {t('common.trackNumbered', { number, name })}
        </Text>
      </Pressable>
      {isSelected && onStartRename !== undefined ? (
        <Pressable onPress={onStartRename} tooltip={t('window.tracks.rename')} accessibilityRole="button" accessibilityLabel={t('window.tracks.renameOf', { number })} style={styles.renameButton}>
          {/* i18n-exempt: a pencil */}
          <Text style={[styles.renameText, { color: palette.chromeMuted }]}>✎</Text>
        </Pressable>
      ) : null}
    </>
  );
}

interface RenameFieldProps {
  readonly palette: Palette;
  readonly number: number;
  readonly draft: string;
  readonly onChange: (draft: string) => void;
  /** The name typed (Return, leaving the field), or undefined (Esc): the field goes. */
  readonly onDone: (name: string | undefined) => void;
}

/** The name typed in place of the name. */
function RenameField({ palette, number, draft, onChange, onDone }: RenameFieldProps) {
  const t = useT();
  // Return or Esc ends it; the blur that follows as the field goes must not end it again.
  const isDone = useRef(false);
  const finish = (name: string | undefined) => {
    if (!isDone.current) {
      isDone.current = true;
      onDone(name);
    }
  };
  const onKeyDown = (event: KeyEvent) => {
    if (event.nativeEvent.key === 'Escape') {
      // Esc only puts the name back: it neither stops playback nor closes a panel.
      event.stopPropagation();
      finish(undefined);
    }
  };
  return (
    <TextField
      value={draft}
      onChangeText={onChange}
      onSubmitEditing={() => finish(draft)}
      onBlur={() => finish(draft)}
      onKeyDown={onKeyDown}
      autoFocus
      selectTextOnFocus
      accessibilityLabel={t('window.tracks.nameFieldOf', { number })}
      style={[styles.nameField, { color: palette.chromeText, backgroundColor: palette.chromeDeep, borderColor: palette.chromeAccent }]}
    />
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
  readonly onPress: (event: GestureResponderEvent) => void;
  /** The button's view, for a panel it opens beside itself. */
  readonly pressableRef?: Ref<View>;
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
      ref={props.pressableRef}
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
function TrackTableHeaderView({ palette, isMultitrack = false, onToggleMultitrack }: TrackTableBandProps) {
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

/** Memoised: the table's header stays while the song is edited. */
export const TrackTableHeader = memo(TrackTableHeaderView);

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
  colorStrip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: TRACK_TABLE.colorStrip },
  name: { flex: 1, height: BAR_MAP.rowHeight, justifyContent: 'center', marginLeft: 6, marginRight: 4 },
  nameText: { fontSize: 12 },
  nameField: { flex: 1, height: 18, fontSize: 12, paddingHorizontal: 4, paddingVertical: 0, marginLeft: 6, marginRight: 4, borderRadius: 3, borderWidth: 1 },
  renameButton: { width: 16, height: 18, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  renameText: { fontSize: 12 },
  selectedName: { fontWeight: '700' },
  dragged: { opacity: 0.45 },
  toggles: { flexDirection: 'row', gap: TRACK_TABLE.toggleGap, marginRight: TRACK_TABLE.columnGap },
  gap: { width: TRACK_TABLE.columnGap },
  iconButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  icon: { width: PANEL_ICON_SIZE, height: PANEL_ICON_SIZE },
});
