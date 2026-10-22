import { StyleSheet, Text, View } from 'react-native';
import type { Song } from '@gp-editor/core';
import type { LoopPass } from '../lib/practice-plan';
import type { SoundBanks } from '../native/player';
import { TEMPO_STEP, playbackTempo, resolveTrainerMaxTempo, tempoPercent } from '../lib/practice-tempo';
import { type PracticeAction, type PracticeSettings, resolveLoopRange } from '../state/practice';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';
import { Group, Stepper } from './BarControls';
import { SoundBankGroup } from './SoundBankGroup';

export interface TransportBarProps {
  readonly palette: Palette;
  readonly song: Song;
  /** Bar of the cursor (0-based): ▶ Play starts there, and the cursor buttons set the loop ends to it. */
  readonly cursorMeasureIndex?: number;
  readonly practice: PracticeSettings;
  /** While a loop plays: the pass being played. */
  readonly loopPass?: LoopPass;
  readonly onChangePractice: (action: PracticeAction) => void;
  readonly soundBanks: SoundBanks;
  readonly onSelectSoundBank: (id: string) => void;
  readonly onAddSoundBank: () => void;
  readonly onRemoveSoundBank: (id: string) => void;
}

/** Facts the three groups share: the song's bar count, the loop (clamped), and the bar the tempo is shown for. */
interface TransportContext {
  readonly measureCount: number;
  readonly fromMeasureIndex: number;
  readonly toMeasureIndex: number;
  /** Written tempo of the bar playback starts from: the loop's first bar, or the cursor's bar. */
  readonly writtenTempo: number;
}

function transportContext(
  song: Song,
  practice: PracticeSettings,
  cursorMeasureIndex: number | undefined,
): TransportContext {
  const measureCount = song.measureHeaders.length;
  const loop = resolveLoopRange(practice.loop, measureCount, cursorMeasureIndex);
  const startIndex = practice.isLooping ? loop.fromMeasureIndex : cursorMeasureIndex ?? 0;
  const writtenTempo = song.measureHeaders[startIndex]?.tempo ?? song.measureHeaders[0]?.tempo ?? 0;
  return { measureCount, ...loop, writtenTempo };
}

/**
 * Third toolbar row, for playback: the sound bank, playback tempo (a scale of every written tempo; the song is not
 * edited), a loop of bars played until stopped, and the speed trainer that plays each pass of the loop faster. Wraps in
 * a narrow window.
 */
export function TransportBar(props: TransportBarProps) {
  const { palette, song, practice, cursorMeasureIndex } = props;
  const context = transportContext(song, practice, cursorMeasureIndex);
  return (
    <View style={[styles.container, { backgroundColor: palette.sidebar, borderColor: palette.border }]}>
      <View style={styles.content}>
        <SoundBankGroup
          soundBanks={props.soundBanks}
          palette={palette}
          onSelect={props.onSelectSoundBank}
          onAdd={props.onAddSoundBank}
          onRemove={props.onRemoveSoundBank}
        />
        <TempoGroup {...props} context={context} />
        <LoopGroup {...props} context={context} />
        <TrainerGroup {...props} context={context} />
        {props.loopPass !== undefined ? (
          <Text style={[styles.status, { color: palette.accent }]}>
            {`Pass ${props.loopPass.passIndex + 1} · ♩ ${props.loopPass.tempo}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface GroupPropsWithContext extends TransportBarProps {
  readonly context: TransportContext;
}

function TempoGroup({ palette, practice, context, onChangePractice }: GroupPropsWithContext) {
  const { writtenTempo } = context;
  const label = `♩ ${playbackTempo(writtenTempo, practice.tempoScale)} · ${tempoPercent(practice.tempoScale)}%`;
  const shift = (delta: number) => onChangePractice({ type: 'shiftTempo', delta, writtenTempo });
  return (
    <Group title="Playback tempo" palette={palette}>
      <Stepper
        label={label}
        palette={palette}
        isEnabled={writtenTempo > 0}
        labelWidth={92}
        onMinus={() => shift(-TEMPO_STEP)}
        onPlus={() => shift(TEMPO_STEP)}
      />
      <BarButton
        label="100%"
        palette={palette}
        isEnabled={practice.tempoScale !== 1}
        onPress={() => onChangePractice({ type: 'resetTempo' })}
      />
    </Group>
  );
}

function LoopGroup({ palette, practice, context, cursorMeasureIndex, onChangePractice }: GroupPropsWithContext) {
  const { fromMeasureIndex, toMeasureIndex } = context;
  const hasCursor = cursorMeasureIndex !== undefined;
  // Before a loop is set, both ends show (and stay at) the cursor's bar.
  const scope = { measureCount: context.measureCount, cursorMeasureIndex: cursorMeasureIndex ?? 0 };
  const setFrom = (measureIndex: number) => onChangePractice({ type: 'setLoopFrom', measureIndex, ...scope });
  const setTo = (measureIndex: number) => onChangePractice({ type: 'setLoopTo', measureIndex, ...scope });
  return (
    <Group title="Loop" palette={palette}>
      <BarButton
        label="Loop"
        palette={palette}
        isActive={practice.isLooping}
        onPress={() => onChangePractice({ type: 'toggleLoop', ...scope })}
      />
      <Stepper
        label={`From ${fromMeasureIndex + 1}`}
        palette={palette}
        isEnabled
        labelWidth={60}
        onMinus={() => setFrom(fromMeasureIndex - 1)}
        onPlus={() => setFrom(fromMeasureIndex + 1)}
      />
      <Stepper
        label={`To ${toMeasureIndex + 1}`}
        palette={palette}
        isEnabled
        labelWidth={48}
        onMinus={() => setTo(toMeasureIndex - 1)}
        onPlus={() => setTo(toMeasureIndex + 1)}
      />
      <BarButton
        label="From cursor"
        palette={palette}
        isEnabled={hasCursor}
        onPress={() => setFrom(scope.cursorMeasureIndex)}
      />
      <BarButton
        label="To cursor"
        palette={palette}
        isEnabled={hasCursor}
        onPress={() => setTo(scope.cursorMeasureIndex)}
      />
    </Group>
  );
}

function TrainerGroup({ palette, practice, context, onChangePractice }: GroupPropsWithContext) {
  const { writtenTempo } = context;
  const step = practice.trainerStep;
  const maxTempo = resolveTrainerMaxTempo(practice.trainerMaxTempo, writtenTempo, practice.tempoScale);
  const shiftStep = (delta: number) => onChangePractice({ type: 'shiftTrainerStep', delta });
  const shiftMax = (delta: number) => onChangePractice({ type: 'shiftTrainerMaxTempo', delta, writtenTempo });
  return (
    <Group title="Speed trainer" palette={palette}>
      <Stepper
        label={step === 0 ? 'Off' : `+${step} BPM / pass`}
        palette={palette}
        isEnabled={practice.isLooping}
        labelWidth={100}
        onMinus={() => shiftStep(-1)}
        onPlus={() => shiftStep(1)}
      />
      <Stepper
        label={`up to ♩ ${maxTempo}`}
        palette={palette}
        isEnabled={practice.isLooping && step > 0}
        labelWidth={82}
        onMinus={() => shiftMax(-TEMPO_STEP)}
        onPlus={() => shiftMax(TEMPO_STEP)}
      />
    </Group>
  );
}

// Same look as the edit bar above it.
const styles = StyleSheet.create({
  container: { borderBottomWidth: StyleSheet.hairlineWidth },
  content: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 6,
  },
  status: { fontSize: 12, fontWeight: '600', marginTop: 4, paddingBottom: 4 },
});
