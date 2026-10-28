import { StyleSheet, View } from 'react-native';
import { useT } from '../hooks/use-i18n';
import { TEMPO_STEP, playbackTempo, resolveTrainerMaxTempo, tempoPercent } from '../lib/practice-tempo';
import { type PracticeAction, type PracticeSettings, resolveLoopRange } from '../state/practice';
import type { Palette } from '../theme';
import { MenuButton, MenuHeading, MenuItem, MenuSeparator, MenuStepper } from './chrome/ChromeMenu';

/** Guitar Pro's speed menu: percentages of the written tempo (25%–200%), then tempos in BPM. */
const SPEED_PERCENTS: readonly number[] = [25, 50, 60, 70, 80, 90, 100, 110, 125, 150, 200];
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
  const t = useT();
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
          label={value === writtenTempo ? t('window.speedMenu.writtenTempo', { tempo: value }) : t('window.bpm', { tempo: value })}
          isChecked={tempo === value && percent !== 100}
          onPress={() => choose({ type: 'setTempo', tempo: value, writtenTempo })}
        />
      ))}
      <MenuStepper
        palette={palette}
        label={t('window.speedMenu.custom')}
        value={t('window.bpm', { tempo })}
        tooltip={t('window.speedMenu.customTooltip')}
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
  const t = useT();
  const scope = { measureCount };
  const loop = resolveLoopRange(practice.loop, measureCount);
  const setFrom = (measureIndex: number) => onChangePractice({ type: 'setLoopFrom', measureIndex, ...scope });
  const setTo = (measureIndex: number) => onChangePractice({ type: 'setLoopTo', measureIndex, ...scope });
  return (
    <>
      <MenuHeading palette={palette} label={t('window.speedMenu.loopHeading')} />
      <MenuStepper palette={palette} label={t('window.speedMenu.fromBar')} value={String(loop.fromMeasureIndex + 1)} tooltip={t('window.speedMenu.fromBarTooltip')} onDecrease={() => setFrom(loop.fromMeasureIndex - 1)} onIncrease={() => setFrom(loop.fromMeasureIndex + 1)} />
      <MenuStepper palette={palette} label={t('window.speedMenu.toBar')} value={String(loop.toMeasureIndex + 1)} tooltip={t('window.speedMenu.toBarTooltip')} onDecrease={() => setTo(loop.toMeasureIndex - 1)} onIncrease={() => setTo(loop.toMeasureIndex + 1)} />
      <View style={styles.buttons}>
        <MenuButton palette={palette} label={t('window.speedMenu.fromCursor')} tooltip={t('window.speedMenu.fromCursorTooltip')} onPress={() => setFrom(cursorMeasureIndex)} />
        <MenuButton palette={palette} label={t('window.speedMenu.toCursor')} tooltip={t('window.speedMenu.toCursorTooltip')} onPress={() => setTo(cursorMeasureIndex)} />
      </View>
    </>
  );
}

function TrainerSection({ palette, practice, writtenTempo, onChangePractice }: SpeedMenuProps) {
  const t = useT();
  const maxTempo = resolveTrainerMaxTempo(practice.trainerMaxTempo, writtenTempo, practice.tempoScale);
  return (
    <>
      <MenuHeading palette={palette} label={t('window.speedMenu.trainerHeading')} />
      <MenuStepper
        palette={palette}
        label={t('window.speedMenu.eachPass')}
        value={practice.trainerStep === 0 ? t('common.off') : `+${t('window.bpm', { tempo: practice.trainerStep })}`}
        tooltip={t('window.speedMenu.eachPassTooltip')}
        onDecrease={() => onChangePractice({ type: 'shiftTrainerStep', delta: -1 })}
        onIncrease={() => onChangePractice({ type: 'shiftTrainerStep', delta: 1 })}
      />
      <MenuStepper
        palette={palette}
        label={t('window.speedMenu.upTo')}
        value={`♩ ${maxTempo}`}
        tooltip={t('window.speedMenu.upToTooltip')}
        onDecrease={() => onChangePractice({ type: 'shiftTrainerMaxTempo', delta: -TEMPO_STEP, writtenTempo })}
        onIncrease={() => onChangePractice({ type: 'shiftTrainerMaxTempo', delta: TEMPO_STEP, writtenTempo })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingVertical: 3 },
});
