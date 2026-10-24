import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { audioExportSeconds, audioExportSummary, planAudioExport } from '../export/audio-export-plan';
import {
  AUDIO_FORMATS,
  type AudioExportOptions,
  BIT_DEPTHS,
  MP3_BITRATES,
  OGG_QUALITIES,
  SAMPLE_RATES,
  audioFormat,
  mp3BitrateLabel,
  oggQualityLabel,
  sampleRateLabel,
} from '../export/audio-formats';
import type { AudioExportStatus } from '../hooks/use-audio-export';
import type { LoopRange } from '../state/practice';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';

interface AudioExportPanelProps {
  readonly palette: Palette;
  readonly song: Song;
  /** The open file's name: the exported files are named after it. */
  readonly fileName: string;
  /** The practice loop's bars, when a loop is set. */
  readonly loop?: LoopRange;
  readonly options: AudioExportOptions;
  readonly status: AudioExportStatus;
  readonly onChangeOptions: (options: AudioExportOptions) => void;
  readonly onExport: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
}

interface OptionRowProps {
  readonly palette: Palette;
  readonly options: AudioExportOptions;
  readonly isEnabled: boolean;
  readonly onChange: (options: AudioExportOptions) => void;
}

/** The format's quality (bit depth, bit rate or Vorbis quality), then the sample rate. */
function QualityRow({ palette, options, isEnabled, onChange }: OptionRowProps) {
  const format = audioFormat(options.formatId);
  const choices =
    format.id === 'mp3'
      ? { label: 'Bit rate', items: MP3_BITRATES.map((value) => ({ text: mp3BitrateLabel(value), isActive: value === options.mp3Bitrate, next: { ...options, mp3Bitrate: value } })) }
      : format.id === 'ogg'
      ? { label: 'Quality', items: OGG_QUALITIES.map((value) => ({ text: oggQualityLabel(value), isActive: value === options.oggQuality, next: { ...options, oggQuality: value } })) }
      : { label: 'Bit depth', items: BIT_DEPTHS.map((value) => ({ text: `${value}-bit`, isActive: value === options.bitDepth, next: { ...options, bitDepth: value } })) };
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.text }]}>{choices.label}</Text>
      {choices.items.map((item) => (
        <BarButton key={item.text} label={item.text} palette={palette} isActive={item.isActive} isEnabled={isEnabled} onPress={() => onChange(item.next)} />
      ))}
      <Text style={[styles.label, styles.spaced, { color: palette.text }]}>Sample rate</Text>
      {SAMPLE_RATES.map((rate) => (
        <BarButton key={rate} label={sampleRateLabel(rate)} palette={palette} isActive={rate === options.sampleRate} isEnabled={isEnabled} onPress={() => onChange({ ...options, sampleRate: rate })} />
      ))}
    </View>
  );
}

/** The whole song or the loop's bars; one file or one per track. */
function RangeRow({ palette, options, isEnabled, onChange, loop }: OptionRowProps & { readonly loop?: LoopRange }) {
  const loopLabel =
    loop === undefined
      ? 'Loop bars (none set)'
      : loop.fromMeasureIndex === loop.toMeasureIndex
      ? `Loop bar ${loop.fromMeasureIndex + 1}`
      : `Loop bars ${loop.fromMeasureIndex + 1}–${loop.toMeasureIndex + 1}`;
  const isLoop = options.range === 'loop' && loop !== undefined;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.text }]}>Play</Text>
      <BarButton label="Whole song" palette={palette} isActive={!isLoop} isEnabled={isEnabled} onPress={() => onChange({ ...options, range: 'song' })} />
      <BarButton label={loopLabel} palette={palette} isActive={isLoop} isEnabled={isEnabled && loop !== undefined} onPress={() => onChange({ ...options, range: 'loop' })} />
      <Text style={[styles.label, styles.spaced, { color: palette.text }]}>Files</Text>
      <BarButton label="One file" palette={palette} isActive={!options.isPerTrack} isEnabled={isEnabled} onPress={() => onChange({ ...options, isPerTrack: false })} />
      <BarButton label="One file per track" palette={palette} isActive={options.isPerTrack} isEnabled={isEnabled} onPress={() => onChange({ ...options, isPerTrack: true })} />
    </View>
  );
}

/** What the status line says while the export runs. */
function statusText(status: AudioExportStatus): string | undefined {
  switch (status.kind) {
    case 'choosing':
      return 'Choose where to save…';
    case 'rendering':
      return `Rendering file ${status.fileIndex + 1} of ${status.fileCount}: ${Math.round(status.fraction * 100)}%`;
    case 'cancelling':
      return 'Stopping…';
    default:
      return undefined;
  }
}

/** The files' overall progress, 0–1. */
function overallFraction(status: AudioExportStatus): number {
  return status.kind === 'rendering' ? (status.fileIndex + status.fraction) / Math.max(1, status.fileCount) : 0;
}

/**
 * File ▸ Export Audio…: the format (WAV, AIFF, FLAC, MP3, Ogg Vorbis) and its quality, the sample rate, the whole song
 * or the loop's bars, one file or one per track; Export… asks where to save, then the render's progress with Cancel.
 */
export function AudioExportPanel({ palette, song, fileName, loop, options, status, onChangeOptions, onExport, onCancel, onClose }: AudioExportPanelProps) {
  // A render of the song: again only for another song or range, not for another format.
  const seconds = useMemo(() => audioExportSeconds(song, options.range, loop), [song, options.range, loop]);
  const summary = audioExportSummary(song, fileName, options, loop, seconds);
  const hasFiles = useMemo(() => planAudioExport(song, fileName, options, loop).length > 0, [song, fileName, options, loop]);
  const isIdle = status.kind === 'idle';
  const running = statusText(status);
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>Export Audio</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>
          The song as playback plays it: its sounds, volumes, effects and master mix, repeats unfolded, at its own tempo.
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>Format</Text>
        {AUDIO_FORMATS.map((format) => (
          <BarButton
            key={format.id}
            label={format.name}
            palette={palette}
            isActive={format.id === options.formatId}
            isEnabled={isIdle}
            onPress={() => onChangeOptions({ ...options, formatId: format.id })}
          />
        ))}
      </View>
      <QualityRow palette={palette} options={options} isEnabled={isIdle} onChange={onChangeOptions} />
      <RangeRow palette={palette} options={options} isEnabled={isIdle} onChange={onChangeOptions} loop={loop} />
      <View style={styles.row}>
        <BarButton label="Export…" palette={palette} isAccent isEnabled={isIdle && hasFiles} onPress={onExport} />
        {status.kind === 'rendering' ? <BarButton label="Cancel" palette={palette} onPress={onCancel} /> : null}
        <BarButton label="Close" palette={palette} onPress={onClose} />
        {status.kind === 'rendering' ? (
          <View style={[styles.track, { backgroundColor: palette.border }]}>
            <View style={[styles.fill, { backgroundColor: palette.accent, width: `${Math.round(overallFraction(status) * 100)}%` }]} />
          </View>
        ) : null}
        <Text style={[styles.hint, { color: palette.muted }]}>{running ?? summary}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '700', marginRight: 12 },
  label: { fontSize: 12, fontWeight: '600', marginRight: 8 },
  spaced: { marginLeft: 12 },
  hint: { fontSize: 11, marginLeft: 4, marginRight: 8, flexShrink: 1 },
  track: { width: 160, height: 6, borderRadius: 3, overflow: 'hidden', marginLeft: 4, marginRight: 4 },
  fill: { height: 6 },
});
