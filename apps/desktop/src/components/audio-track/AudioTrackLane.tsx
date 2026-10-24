import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type AudioTrack, type Song, buildSyncMap } from '@gp-editor/core';
import type { AudioTrackLaneCommands } from '../../hooks/use-audio-track';
import { useT } from '../../hooks/use-i18n';
import { AUDIO_LANE } from '../../score/audio-lane';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { TRACK_TABLE } from '../TrackMixerRow';
import { AudioTrackControls } from './AudioTrackControls';
import { AudioWaveform } from './AudioWaveform';

export interface AudioTrackLaneProps {
  readonly song: Song;
  readonly audioTrack: AudioTrack;
  readonly lane: AudioTrackLaneCommands;
  readonly cursorMeasureIndex?: number;
  /** The moment of the audio heard now, while it plays. */
  readonly playingSeconds?: number;
  readonly palette: Palette;
  /** A click on the waveform away from the markers: the bar heard there. */
  readonly onSelectBar: (measureIndex: number) => void;
}

/** The file the audio came from, without its folders. */
function fileNameOf(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/** Name, file, Replace… and remove; the strip; the sync tools and the zoom. */
function LaneHeader({ audioTrack, lane, cursorMeasureIndex, palette }: AudioTrackLaneProps) {
  const t = useT();
  const barNumber = (cursorMeasureIndex ?? 0) + 1;
  const fileName = fileNameOf(audioTrack.originalFilePath);
  return (
    <View style={[styles.header, { borderRightColor: palette.chromeBorder }]}>
      <View style={styles.row}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.chromeText }]}>
          {`♫ ${audioTrack.name}`}
        </Text>
        <Text numberOfLines={1} style={[styles.file, { color: palette.chromeMuted }]}>
          {lane.peaks === undefined && lane.error !== undefined ? lane.error : fileName}
        </Text>
        <ChromeButton palette={palette} label={t('tools.audioTrack.replace')} tooltip={t('tools.audioTrack.replaceTooltip')} fontSize={11} onPress={lane.addAudioTrack} />
        <ChromeButton palette={palette} label="✕" tooltip={t('tools.audioTrack.remove')} fontSize={11} onPress={lane.removeAudioTrack} />
      </View>
      <AudioTrackControls audioTrack={audioTrack} palette={palette} onSetMix={lane.setMix} />
      <View style={styles.row}>
        <ChromeButton palette={palette} label={t('tools.audioTrack.syncBar', { number: barNumber })} tooltip={t('tools.audioTrack.syncBarTooltip', { number: barNumber })} fontSize={11} onPress={lane.markSyncPoint} />
        <ChromeButton
          palette={palette}
          label={t('tools.audioTrack.deletePoint')}
          tooltip={t('tools.audioTrack.deletePointTooltip')}
          fontSize={11}
          isEnabled={lane.selectedPointIndex !== undefined}
          onPress={lane.deleteSelectedPoint}
        />
        <ChromeButton palette={palette} label={t('common.tempo')} tooltip={t('tools.audioTrack.tempoTooltip')} fontSize={11} onPress={lane.tempoFromAudio} />
        <View style={styles.spacer} />
        <ChromeButton palette={palette} label="−" tooltip={t('tools.audioTrack.zoomOut')} isEnabled={lane.canZoomOut} onPress={lane.zoomOut} />
        <ChromeButton palette={palette} label="+" tooltip={t('tools.audioTrack.zoomIn')} isEnabled={lane.canZoomIn} onPress={lane.zoomIn} />
      </View>
    </View>
  );
}

/**
 * Guitar Pro's audio track lane under the tracks: its controls on the left (as wide as the track table), the waveform on
 * the right with the bars placed over it by the sync points.
 */
function AudioTrackLaneView(props: AudioTrackLaneProps) {
  const { song, audioTrack, lane, palette } = props;
  const map = useMemo(() => buildSyncMap(song), [song]);
  const barNumbers = useMemo(() => song.measureHeaders.map((header) => header.number), [song.measureHeaders]);
  return (
    <View testID="audio-track-lane" style={[styles.lane, { backgroundColor: palette.chrome, borderTopColor: palette.chromeBorder }]}>
      <LaneHeader {...props} />
      <AudioWaveform
        map={map}
        points={audioTrack.syncPoints}
        peaks={lane.peaks}
        durationSeconds={lane.durationSeconds}
        pixelsPerSecond={lane.pixelsPerSecond}
        barNumbers={barNumbers}
        cursorMeasureIndex={props.cursorMeasureIndex}
        selectedPointIndex={lane.selectedPointIndex}
        playingSeconds={props.playingSeconds}
        palette={palette}
        onSelectPoint={lane.selectPoint}
        onMovePoint={lane.movePoint}
        onSelectBar={props.onSelectBar}
        pointRange={lane.pointRange}
      />
    </View>
  );
}

export const AudioTrackLane = memo(AudioTrackLaneView);

const styles = StyleSheet.create({
  lane: { flexDirection: 'row', height: AUDIO_LANE.height, borderTopWidth: 1 },
  header: { width: TRACK_TABLE.width, borderRightWidth: 1, paddingHorizontal: TRACK_TABLE.padding, justifyContent: 'space-around' },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 12, fontWeight: '700', marginRight: 6 },
  file: { flex: 1, fontSize: 11 },
  spacer: { flex: 1 },
});
