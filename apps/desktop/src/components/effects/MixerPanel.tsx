import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type AudioTrack, type AudioTrackMix, DEFAULT_MASTER, EFFECT_NAMES, type Effect, type MasterMix, type Song, toggleEffect } from '@gp-editor/core';
import type { MixPreview } from '../../lib/mix';
import { formatEffectValue } from '../../lib/effect-values';
import type { Palette } from '../../theme';
import { AudioTrackControls } from '../audio-track/AudioTrackControls';
import { ChromeButton } from '../chrome/ChromeButton';
import { EffectChainEditor } from './EffectChainEditor';
import { MasterStripEditor, OUTPUT_GAIN } from './MasterStripEditor';

export const MIXER_PANEL = { height: 270, stripWidth: 128, audioStripWidth: 156, editorWidth: 300 } as const;

export interface MixerPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  readonly selectedTrackIndex: number;
  readonly onSelectTrack: (trackIndex: number) => void;
  /** One undo step per call. */
  readonly onSetTrackEffects: (trackIndex: number, effects: readonly Effect[]) => void;
  readonly onSetMasterMix: (master: MasterMix) => void;
  /** The audio track's strip (volume, mute, solo, detune); one undo step per call. */
  readonly onSetAudioTrackMix?: (mix: AudioTrackMix) => void;
  /** While a slider is dragged: what to hear now; undefined when the drag ended unchanged. */
  readonly onPreview: (preview: MixPreview | undefined) => void;
  readonly onClose: () => void;
}

interface StripProps {
  readonly palette: Palette;
  readonly title: string;
  readonly color?: string;
  readonly effects: readonly Effect[];
  readonly footer?: string;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly onToggle: (index: number) => void;
}

/** A channel strip: its name (selects it), then its effects in order, each switched on or off by a click. */
function Strip({ palette, title, color, effects, footer, isSelected, onSelect, onToggle }: StripProps) {
  return (
    <View style={[styles.strip, { borderColor: isSelected ? palette.chromeAccent : palette.chromeBorder, backgroundColor: palette.chromeDeep }]}>
      <Pressable style={styles.stripHeader} onPress={onSelect} tooltip={`Edit the effects of ${title}`} accessibilityRole="button" accessibilityLabel={`Edit the effects of ${title}`}>
        {color === undefined ? null : <View style={[styles.swatch, { backgroundColor: color }]} />}
        <Text numberOfLines={1} style={[styles.stripTitle, { color: palette.chromeText }]}>
          {title}
        </Text>
      </Pressable>
      {effects.length === 0 ? <Text style={[styles.none, { color: palette.chromeMuted }]}>No effects</Text> : null}
      {effects.map((effect, index) => (
        <ChromeButton
          key={`${index}-${effect.type}`}
          palette={palette}
          label={`${effect.isEnabled ? '●' : '○'} ${EFFECT_NAMES[effect.type]}`}
          tooltip={`${effect.isEnabled ? 'Switch off' : 'Switch on'} ${EFFECT_NAMES[effect.type]} on ${title}`}
          fontSize={11}
          isActive={effect.isEnabled}
          onPress={() => onToggle(index)}
        />
      ))}
      {footer === undefined ? null : <Text style={[styles.none, { color: palette.chromeMuted }]}>{footer}</Text>}
    </View>
  );
}

interface AudioStripProps {
  readonly palette: Palette;
  readonly audioTrack: AudioTrack;
  readonly onSetMix: (mix: AudioTrackMix) => void;
}

/** The audio track's strip: no effects, its volume, mute, solo and detune. */
function AudioStrip({ palette, audioTrack, onSetMix }: AudioStripProps) {
  return (
    <View testID="mixer-audio-strip" style={[styles.strip, styles.audioStrip, { borderColor: palette.chromeBorder, backgroundColor: palette.chromeDeep }]}>
      <View style={styles.stripHeader}>
        <Text numberOfLines={1} style={[styles.stripTitle, { color: palette.chromeText }]}>
          {`♫ ${audioTrack.name}`}
        </Text>
      </View>
      <AudioTrackControls audioTrack={audioTrack} palette={palette} onSetMix={onSetMix} volumeWidth={100} isStacked />
    </View>
  );
}

/**
 * View ▸ Mixer: a strip per track and the master strip, across the bottom of the window. The track strips scroll
 * sideways; the audio track's strip and the master strip stay in view after them, however many tracks the song has. A
 * strip's effects switch on and off from it; the selected strip's chain (or the master) is edited on the right — add,
 * remove, reorder, presets, and every value, heard while it is dragged.
 */
export function MixerPanel(props: MixerPanelProps) {
  const { palette, song, selectedTrackIndex } = props;
  const [isMasterSelected, setIsMasterSelected] = useState(false);
  const master = song.master ?? DEFAULT_MASTER;
  const track = song.tracks[selectedTrackIndex];
  const trackEffects = track?.effects ?? [];
  return (
    <View style={[styles.panel, { backgroundColor: palette.chrome, borderTopColor: palette.chromeBorder }]}>
      <ScrollView horizontal style={styles.strips} contentContainerStyle={styles.stripsContent}>
        {song.tracks.map((each, trackIndex) => (
          <Strip
            key={trackIndex}
            palette={palette}
            title={`${each.number}. ${each.name}`}
            color={`rgb(${each.color.r},${each.color.g},${each.color.b})`}
            effects={each.effects ?? []}
            isSelected={!isMasterSelected && trackIndex === selectedTrackIndex}
            onSelect={() => {
              setIsMasterSelected(false);
              props.onSelectTrack(trackIndex);
            }}
            onToggle={(index) => props.onSetTrackEffects(trackIndex, toggleEffect(each.effects ?? [], index))}
          />
        ))}
      </ScrollView>
      <View testID="mixer-pinned-strips" style={[styles.pinned, { borderLeftColor: palette.chromeBorder }]}>
        {song.audioTrack === undefined || props.onSetAudioTrackMix === undefined ? null : (
          <AudioStrip palette={palette} audioTrack={song.audioTrack} onSetMix={props.onSetAudioTrackMix} />
        )}
        <Strip
          palette={palette}
          title="Master"
          effects={master.effects}
          footer={formatEffectValue(OUTPUT_GAIN, master.gainDb)}
          isSelected={isMasterSelected}
          onSelect={() => setIsMasterSelected(true)}
          onToggle={(index) => props.onSetMasterMix({ ...master, effects: toggleEffect(master.effects, index) })}
        />
      </View>
      <View style={[styles.editorPane, { borderLeftColor: palette.chromeBorder }]}>
        <View style={styles.editorHeader}>
          <Text numberOfLines={1} style={[styles.editorTitle, { color: palette.chromeText }]}>
            {isMasterSelected ? 'MASTER' : `EFFECTS · ${track?.name ?? ''}`}
          </Text>
          <ChromeButton palette={palette} label="✕" tooltip="Close the mixer" onPress={props.onClose} />
        </View>
        <ScrollView style={styles.editorScroll}>
          {isMasterSelected ? (
            <MasterStripEditor palette={palette} master={master} width={MIXER_PANEL.editorWidth - 20} onChange={props.onSetMasterMix} onPreview={(next) => props.onPreview(next === undefined ? undefined : { master: next })} />
          ) : (
            <EffectChainEditor
              key={selectedTrackIndex}
              palette={palette}
              effects={trackEffects}
              width={MIXER_PANEL.editorWidth - 20}
              onChange={(effects) => props.onSetTrackEffects(selectedTrackIndex, effects)}
              onPreview={(effects) => props.onPreview(effects === undefined ? undefined : { trackIndex: selectedTrackIndex, effects })}
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { height: MIXER_PANEL.height, flexDirection: 'row', borderTopWidth: 1 },
  strips: { flex: 1 },
  stripsContent: { padding: 8 },
  pinned: { flexDirection: 'row', paddingVertical: 8, paddingLeft: 8, paddingRight: 2, borderLeftWidth: StyleSheet.hairlineWidth },
  strip: { width: MIXER_PANEL.stripWidth, marginRight: 6, borderWidth: 1, borderRadius: 6, padding: 4 },
  audioStrip: { width: MIXER_PANEL.audioStripWidth },
  stripHeader: { flexDirection: 'row', alignItems: 'center', height: 24, marginBottom: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2, marginRight: 5 },
  stripTitle: { flex: 1, fontSize: 12, fontWeight: '700' },
  none: { fontSize: 11, marginVertical: 4, textAlign: 'center' },
  editorPane: { width: MIXER_PANEL.editorWidth, borderLeftWidth: 1, paddingHorizontal: 10 },
  editorHeader: { flexDirection: 'row', alignItems: 'center', height: 30 },
  editorTitle: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  editorScroll: { flex: 1 },
});
