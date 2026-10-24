import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AudioTrack, AudioTrackMix } from '@gp-editor/core';
import { DETUNE_STEP, SEMITONE_CENTS, formatDetune, shiftDetune, sliderToVolume, volumeToSlider } from '../../lib/audio-track';
import { engraveHeadphonesIcon, engraveSpeakerIcon } from '../../score/panel-icons';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { MixerSlider } from '../MixerSlider';
import { PanelIconButton } from '../TrackMixerRow';

export interface AudioTrackControlsProps {
  readonly audioTrack: AudioTrack;
  readonly palette: Palette;
  /** One undo step per call (a slider: when its drag ends). */
  readonly onSetMix: (mix: AudioTrackMix) => void;
  /** Width of the volume slider. */
  readonly volumeWidth?: number;
  /** The detune under mute, solo and volume (a mixer strip) instead of beside them. */
  readonly isStacked?: boolean;
}

const VOLUME_WIDTH = 70;

/** Mute, solo and the volume slider. */
function SoundControls({ audioTrack, palette, onSetMix, volumeWidth = VOLUME_WIDTH }: AudioTrackControlsProps) {
  const { mute, solo } = audioTrack;
  const speaker = useMemo(() => engraveSpeakerIcon(mute ? palette.chromeAccentText : palette.chromeMuted, mute), [mute, palette]);
  const headphones = useMemo(() => engraveHeadphonesIcon(solo ? palette.chromeAccentText : palette.chromeMuted), [solo, palette]);
  const setVolume = useCallback((value: number) => onSetMix({ volume: sliderToVolume(value) }), [onSetMix]);
  return (
    <View style={styles.row}>
      <PanelIconButton
        commands={speaker}
        accessibilityLabel="Mute the audio track"
        tooltip={mute ? 'Muted (click to unmute)' : 'Mute'}
        isChecked={mute}
        isHighlighted={mute}
        palette={palette}
        onPress={() => onSetMix({ mute: !mute })}
      />
      <PanelIconButton
        commands={headphones}
        accessibilityLabel="Solo the audio track"
        tooltip={solo ? 'Solo (click to stop)' : 'Solo'}
        isChecked={solo}
        isHighlighted={solo}
        palette={palette}
        onPress={() => onSetMix({ solo: !solo })}
      />
      <View style={styles.gap} />
      <MixerSlider value={volumeToSlider(audioTrack.volume)} width={volumeWidth} label="Volume" accessibilityLabel="Volume of the audio track" palette={palette} onChange={setVolume} />
    </View>
  );
}

/** The detune and its −/+ steps: ten cents, a semitone with the outer ones. */
function DetuneControls({ audioTrack, palette, onSetMix }: AudioTrackControlsProps) {
  const { detuneCents } = audioTrack;
  const detune = (delta: number) => onSetMix({ detuneCents: shiftDetune(detuneCents, delta) });
  return (
    <View style={styles.row}>
      <ChromeButton palette={palette} label="«" tooltip="Detune a semitone down" fontSize={11} minWidth={18} onPress={() => detune(-SEMITONE_CENTS)} />
      <ChromeButton palette={palette} label="−" tooltip="Detune 10 cents down" fontSize={11} minWidth={18} onPress={() => detune(-DETUNE_STEP)} />
      <Text style={[styles.detune, { color: palette.chromeText }]} accessibilityLabel={`Detune ${formatDetune(detuneCents)}`}>
        {formatDetune(detuneCents)}
      </Text>
      <ChromeButton palette={palette} label="+" tooltip="Detune 10 cents up" fontSize={11} minWidth={18} onPress={() => detune(DETUNE_STEP)} />
      <ChromeButton palette={palette} label="»" tooltip="Detune a semitone up" fontSize={11} minWidth={18} onPress={() => detune(SEMITONE_CENTS)} />
    </View>
  );
}

/** The audio track's strip: mute, solo, volume and detune (the pitch shift played with the recording). */
export function AudioTrackControls(props: AudioTrackControlsProps) {
  return (
    <View style={props.isStacked === true ? styles.stack : styles.row}>
      <SoundControls {...props} />
      <View style={styles.gap} />
      <DetuneControls {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stack: { gap: 4 },
  gap: { width: 6 },
  detune: { fontSize: 11, fontVariant: ['tabular-nums'], minWidth: 48, textAlign: 'center' },
});
