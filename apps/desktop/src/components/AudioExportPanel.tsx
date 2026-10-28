import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import { audioExportDescription, audioExportSeconds, audioExportSummary, planAudioExport } from '../export/audio-export-plan';
import {
  AUDIO_FORMATS,
  type AudioExportOptions,
  BIT_DEPTHS,
  MP3_BITRATES,
  OGG_QUALITIES,
  SAMPLE_RATES,
  audioFormat,
  bitDepthLabel,
  mp3BitrateLabel,
  oggQualityLabel,
  sampleRateLabel,
} from '../export/audio-formats';
import type { AudioExportStatus } from '../hooks/use-audio-export';
import { type Translate, useT } from '../hooks/use-i18n';
import { isAudioLoaded } from '../native/audio-track';
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
  const t = useT();
  const format = audioFormat(options.formatId);
  const choices =
    format.id === 'mp3'
      ? { label: t('window.audioExport.bitRate'), items: MP3_BITRATES.map((value) => ({ text: mp3BitrateLabel(value), isActive: value === options.mp3Bitrate, next: { ...options, mp3Bitrate: value } })) }
      : format.id === 'ogg'
      ? { label: t('window.audioExport.quality'), items: OGG_QUALITIES.map((value) => ({ text: oggQualityLabel(value), isActive: value === options.oggQuality, next: { ...options, oggQuality: value } })) }
      : { label: t('window.audioExport.bitDepth'), items: BIT_DEPTHS.map((value) => ({ text: bitDepthLabel(value), isActive: value === options.bitDepth, next: { ...options, bitDepth: value } })) };
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.text }]}>{choices.label}</Text>
      {choices.items.map((item) => (
        <BarButton key={item.text} label={item.text} palette={palette} isActive={item.isActive} isEnabled={isEnabled} onPress={() => onChange(item.next)} />
      ))}
      <Text style={[styles.label, styles.spaced, { color: palette.text }]}>{t('window.audioExport.sampleRate')}</Text>
      {SAMPLE_RATES.map((rate) => (
        <BarButton key={rate} label={sampleRateLabel(rate)} palette={palette} isActive={rate === options.sampleRate} isEnabled={isEnabled} onPress={() => onChange({ ...options, sampleRate: rate })} />
      ))}
    </View>
  );
}

/** The whole song or the loop's bars; one file or one per track. */
function RangeRow({ palette, options, isEnabled, onChange, loop }: OptionRowProps & { readonly loop?: LoopRange }) {
  const t = useT();
  const loopLabel =
    loop === undefined
      ? t('window.audioExport.loopNone')
      : loop.fromMeasureIndex === loop.toMeasureIndex
      ? t('window.audioExport.loopBar', { bar: loop.fromMeasureIndex + 1 })
      : t('window.audioExport.loopBars', { from: loop.fromMeasureIndex + 1, to: loop.toMeasureIndex + 1 });
  const isLoop = options.range === 'loop' && loop !== undefined;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: palette.text }]}>{t('window.audioExport.play')}</Text>
      <BarButton label={t('common.wholeSong')} palette={palette} isActive={!isLoop} isEnabled={isEnabled} onPress={() => onChange({ ...options, range: 'song' })} />
      <BarButton label={loopLabel} palette={palette} isActive={isLoop} isEnabled={isEnabled && loop !== undefined} onPress={() => onChange({ ...options, range: 'loop' })} />
      <Text style={[styles.label, styles.spaced, { color: palette.text }]}>{t('window.audioExport.files')}</Text>
      <BarButton label={t('window.audioExport.oneFile')} palette={palette} isActive={!options.isPerTrack} isEnabled={isEnabled} onPress={() => onChange({ ...options, isPerTrack: false })} />
      <BarButton label={t('window.audioExport.filePerTrack')} palette={palette} isActive={options.isPerTrack} isEnabled={isEnabled} onPress={() => onChange({ ...options, isPerTrack: true })} />
    </View>
  );
}

/** What the status line says while the export runs. */
function statusText(status: AudioExportStatus, t: Translate): string | undefined {
  switch (status.kind) {
    case 'choosing':
      return t('window.audioExport.choosing');
    case 'rendering':
      return t('window.audioExport.rendering', { file: status.fileIndex + 1, count: status.fileCount, percent: Math.round(status.fraction * 100) });
    case 'cancelling':
      return t('window.audioExport.stopping');
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
  const t = useT();
  // A render of the song: again only for another song or range, not for another format.
  // The length at the audio track's pace when it plays (its file loaded) under the whole mix, as the export renders it.
  const hasAudio = song.audioTrack !== undefined && isAudioLoaded(song.audioTrack.assetId);
  const seconds = useMemo(
    () => audioExportSeconds(song, options.range, loop, hasAudio, options.isPerTrack),
    [song, options.range, loop, hasAudio, options.isPerTrack],
  );
  const summary = audioExportSummary(song, fileName, options, loop, seconds);
  const hasFiles = useMemo(() => planAudioExport(song, fileName, options, loop).length > 0, [song, fileName, options, loop]);
  const isIdle = status.kind === 'idle';
  const running = statusText(status, t);
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: palette.text }]}>{t('window.audioExport.title')}</Text>
        <Text style={[styles.hint, { color: palette.muted }]}>{audioExportDescription(song, options.isPerTrack, hasAudio)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: palette.text }]}>{t('window.audioExport.format')}</Text>
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
        <BarButton label={t('window.audioExport.export')} palette={palette} isAccent isEnabled={isIdle && hasFiles} onPress={onExport} />
        {status.kind === 'rendering' ? <BarButton label={t('common.cancel')} palette={palette} onPress={onCancel} /> : null}
        <BarButton label={t('common.close')} palette={palette} onPress={onClose} />
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
