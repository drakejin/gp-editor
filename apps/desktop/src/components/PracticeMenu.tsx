import { METRONOME_VOLUME_STEP, type PracticeAction, type PracticeSettings } from '../state/practice';
import type { Palette } from '../theme';
import { MenuHeading, MenuItem, MenuSeparator, MenuStepper } from './chrome/ChromeMenu';

/** −/+ step of the locked tempo, in BPM (the LCD's tempo field takes decimals). */
const LOCKED_TEMPO_STEP = 1;

export interface PracticeMenuProps {
  readonly palette: Palette;
  readonly practice: PracticeSettings;
  /** Written tempo of the bar playback starts from: where the tempo lock starts. */
  readonly writtenTempo: number;
  readonly onChangePractice: (action: PracticeAction) => void;
}

/**
 * The menu under the top bar's ▾ beside Metronome and Count-in: the metronome and its volume, the count-in, the tempo
 * lock and its tempo, and the hover preview. Toggles leave it open, so their check marks show.
 */
export function PracticeMenu({ palette, practice, writtenTempo, onChangePractice }: PracticeMenuProps) {
  const { lockedTempo } = practice;
  return (
    <>
      <MenuHeading palette={palette} label="Metronome" />
      <MenuItem palette={palette} label="Metronome (⌥M)" isChecked={practice.isMetronomeOn} onPress={() => onChangePractice({ type: 'toggleMetronome' })} />
      <MenuStepper
        palette={palette}
        label="Volume"
        value={`${practice.metronomeVolume}%`}
        tooltip="Metronome volume"
        onDecrease={() => onChangePractice({ type: 'shiftMetronomeVolume', delta: -METRONOME_VOLUME_STEP })}
        onIncrease={() => onChangePractice({ type: 'shiftMetronomeVolume', delta: METRONOME_VOLUME_STEP })}
      />
      <MenuItem palette={palette} label="Count-in before playback (⌥C)" isChecked={practice.isCountInOn} onPress={() => onChangePractice({ type: 'toggleCountIn' })} />
      <MenuSeparator palette={palette} />
      <MenuHeading palette={palette} label="Tempo" />
      <MenuItem
        palette={palette}
        label="Tempo lock: one tempo (⌥L)"
        isChecked={lockedTempo !== undefined}
        onPress={() => onChangePractice({ type: 'toggleTempoLock', writtenTempo })}
      />
      <MenuStepper
        palette={palette}
        label="Locked tempo"
        value={`♩ ${lockedTempo ?? writtenTempo}`}
        tooltip="Locked tempo"
        onDecrease={() => onChangePractice({ type: 'setLockedTempo', tempo: (lockedTempo ?? writtenTempo) - LOCKED_TEMPO_STEP })}
        onIncrease={() => onChangePractice({ type: 'setLockedTempo', tempo: (lockedTempo ?? writtenTempo) + LOCKED_TEMPO_STEP })}
      />
      <MenuSeparator palette={palette} />
      <MenuItem
        palette={palette}
        label="Preview notes on hover"
        isChecked={practice.isPreviewOnHover}
        onPress={() => onChangePractice({ type: 'togglePreviewOnHover' })}
      />
    </>
  );
}
