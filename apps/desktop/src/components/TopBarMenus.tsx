import { StyleSheet, View } from 'react-native';
import { TEMPO_STEP, playbackTempo, resolveTrainerMaxTempo, tempoPercent } from '../lib/practice-tempo';
import { type PracticeAction, type PracticeSettings, resolveLoopRange } from '../state/practice';
import { ZOOM_LEVELS } from '../state/panels';
import type { Palette } from '../theme';
import { MenuButton, MenuHeading, MenuItem, MenuSeparator, MenuStepper } from './chrome/ChromeMenu';

/** Guitar Pro's speed menu: percentages of the written tempo, then tempos in BPM. */
const SPEED_PERCENTS: readonly number[] = [25, 50, 60, 70, 80, 90, 100];
const SPEED_TEMPOS: readonly number[] = [60, 90, 120, 150];

export interface SpeedMenuProps {
  readonly palette: Palette;
  readonly practice: PracticeSettings;
  /** Written tempo of the bar playback starts from. */
  readonly writtenTempo: number;
  readonly measureCount: number;
  readonly cursorMeasureIndex: number;
  readonly onChangePractice: (action: PracticeAction) => void;
  readonly onClose: () => void;
}

/** Playback speed (session only), the loop's bars and the speed trainer — the menu under the top bar's ♩ button. */
export function SpeedMenu(props: SpeedMenuProps) {
  const { palette, practice, writtenTempo, onChangePractice, onClose } = props;
  const percent = tempoPercent(practice.tempoScale);
  const tempo = playbackTempo(writtenTempo, practice.tempoScale);
  const choose = (action: PracticeAction) => {
    onChangePractice(action);
    onClose();
  };
  const tempos = [...new Set([...SPEED_TEMPOS, writtenTempo])].sort((a, b) => a - b);
  return (
    <>
      {SPEED_PERCENTS.map((value) => (
        <MenuItem
          key={`p${value}`}
          palette={palette}
          label={`${value}%`}
          isChecked={percent === value}
          onPress={() => choose({ type: 'setTempoScale', scale: value / 100, writtenTempo })}
        />
      ))}
      <MenuSeparator palette={palette} />
      {tempos.map((value) => (
        <MenuItem
          key={`t${value}`}
          palette={palette}
          label={value === writtenTempo ? `${value} BPM (written tempo)` : `${value} BPM`}
          isChecked={tempo === value && percent !== 100}
          onPress={() => choose({ type: 'setTempo', tempo: value, writtenTempo })}
        />
      ))}
      <MenuStepper
        palette={palette}
        label="Custom"
        value={`${tempo} BPM`}
        tooltip="Playback tempo"
        onDecrease={() => onChangePractice({ type: 'shiftTempo', delta: -TEMPO_STEP, writtenTempo })}
        onIncrease={() => onChangePractice({ type: 'shiftTempo', delta: TEMPO_STEP, writtenTempo })}
      />
      <MenuSeparator palette={palette} />
      <LoopSection {...props} />
      <MenuSeparator palette={palette} />
      <TrainerSection {...props} />
    </>
  );
}

function LoopSection({ palette, practice, measureCount, cursorMeasureIndex, onChangePractice }: SpeedMenuProps) {
  const scope = { measureCount, cursorMeasureIndex };
  const loop = resolveLoopRange(practice.loop, measureCount, cursorMeasureIndex);
  const setFrom = (measureIndex: number) => onChangePractice({ type: 'setLoopFrom', measureIndex, ...scope });
  const setTo = (measureIndex: number) => onChangePractice({ type: 'setLoopTo', measureIndex, ...scope });
  return (
    <>
      <MenuHeading palette={palette} label="Loop bars (⟲ Loop)" />
      <MenuStepper palette={palette} label="From bar" value={String(loop.fromMeasureIndex + 1)} tooltip="First bar of the loop" onDecrease={() => setFrom(loop.fromMeasureIndex - 1)} onIncrease={() => setFrom(loop.fromMeasureIndex + 1)} />
      <MenuStepper palette={palette} label="To bar" value={String(loop.toMeasureIndex + 1)} tooltip="Last bar of the loop" onDecrease={() => setTo(loop.toMeasureIndex - 1)} onIncrease={() => setTo(loop.toMeasureIndex + 1)} />
      <View style={styles.buttons}>
        <MenuButton palette={palette} label="From cursor" tooltip="Start the loop at the cursor’s bar" onPress={() => setFrom(cursorMeasureIndex)} />
        <MenuButton palette={palette} label="To cursor" tooltip="End the loop at the cursor’s bar" onPress={() => setTo(cursorMeasureIndex)} />
      </View>
    </>
  );
}

function TrainerSection({ palette, practice, writtenTempo, onChangePractice }: SpeedMenuProps) {
  const maxTempo = resolveTrainerMaxTempo(practice.trainerMaxTempo, writtenTempo, practice.tempoScale);
  return (
    <>
      <MenuHeading palette={palette} label="Speed trainer (while looping)" />
      <MenuStepper
        palette={palette}
        label="Each pass"
        value={practice.trainerStep === 0 ? 'Off' : `+${practice.trainerStep} BPM`}
        tooltip="BPM added each pass of the loop"
        onDecrease={() => onChangePractice({ type: 'shiftTrainerStep', delta: -1 })}
        onIncrease={() => onChangePractice({ type: 'shiftTrainerStep', delta: 1 })}
      />
      <MenuStepper
        palette={palette}
        label="Up to"
        value={`♩ ${maxTempo}`}
        tooltip="Where the trainer stops rising"
        onDecrease={() => onChangePractice({ type: 'shiftTrainerMaxTempo', delta: -TEMPO_STEP, writtenTempo })}
        onIncrease={() => onChangePractice({ type: 'shiftTrainerMaxTempo', delta: TEMPO_STEP, writtenTempo })}
      />
    </>
  );
}

export function ZoomMenu({ palette, zoom, onZoom, onClose }: { readonly palette: Palette; readonly zoom: number; readonly onZoom: (zoom: number) => void; readonly onClose: () => void }) {
  return (
    <>
      {ZOOM_LEVELS.map((level) => (
        <MenuItem
          key={level}
          palette={palette}
          label={`${Math.round(level * 100)}%`}
          isChecked={Math.abs(level - zoom) < 1e-9}
          onPress={() => {
            onZoom(level);
            onClose();
          }}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingVertical: 3 },
});
