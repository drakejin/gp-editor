import { useCallback, useEffect, useState } from 'react';
import { type SoundBanks, addSoundBank, loadSoundBanks, removeSoundBank, selectSoundBank } from '../native/player';
import { errorMessage } from '../lib/errors';
import { t } from '../lib/i18n/i18n';

export interface SoundBankCommands {
  readonly soundBanks: SoundBanks;
  /** What the last bank operation could not do. */
  readonly error?: string;
  readonly select: (id: string) => void;
  /** Open panel for a .sf2/.dls file, which becomes the selected bank. */
  readonly add: () => void;
  readonly remove: (id: string) => void;
  readonly dismissError: () => void;
}

const NO_BANKS: SoundBanks = { banks: [], selectedId: '' };

/**
 * The sound banks playback can use and the selected one (kept by the native side across launches). `onChanged` runs
 * after the selection changed, so playback can restart with the new sound.
 */
export function useSoundBanks(onChanged: () => void): SoundBankCommands {
  const [soundBanks, setSoundBanks] = useState<SoundBanks>(NO_BANKS);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadSoundBanks()
      .then(setSoundBanks)
      .catch((reason: unknown) => setError(errorMessage(reason, t('tools.soundBank.changeFailed'))));
  }, []);

  const run = useCallback(
    (operation: () => Promise<SoundBanks | null>) => {
      operation()
        .then((next) => {
          if (next !== null) {
            setSoundBanks(next);
            onChanged();
          }
        })
        .catch((reason: unknown) => setError(errorMessage(reason, t('tools.soundBank.changeFailed'))));
    },
    [onChanged],
  );

  const select = useCallback((id: string) => run(() => selectSoundBank(id)), [run]);
  const add = useCallback(() => run(addSoundBank), [run]);
  const remove = useCallback((id: string) => run(() => removeSoundBank(id)), [run]);
  const dismissError = useCallback(() => setError(undefined), []);
  return { soundBanks, error, select, add, remove, dismissError };
}
