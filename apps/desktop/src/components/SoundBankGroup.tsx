import { useState } from 'react';
import type { SoundBanks } from '../native/player';
import type { Palette } from '../theme';
import { BarButton } from './BarButton';
import { Group } from './BarControls';

interface SoundBankGroupProps {
  readonly soundBanks: SoundBanks;
  readonly palette: Palette;
  readonly onSelect: (id: string) => void;
  /** Add a SoundFont (.sf2) or DLS bank from a file. */
  readonly onAdd: () => void;
  readonly onRemove: (id: string) => void;
}

/** Name shown when the player has no bank to choose and uses its own. */
const NO_BANK_NAME = 'Built-in';

/**
 * "Sound" in the transport bar: the sound bank every track plays with (for playback only; not saved in the file). One
 * button shows the selected bank; opened, it lists every bank, Remove for one the user added, and Add SoundFont….
 */
export function SoundBankGroup({ soundBanks, palette, onSelect, onAdd, onRemove }: SoundBankGroupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = soundBanks.banks.find((bank) => bank.id === soundBanks.selectedId);
  const name = selected?.name ?? NO_BANK_NAME;
  return (
    <Group title="Sound" palette={palette}>
      <BarButton label={`${name} ${isOpen ? '▴' : '▾'}`} palette={palette} isActive={isOpen} onPress={() => setIsOpen(!isOpen)} />
      {isOpen
        ? soundBanks.banks.map((bank) => (
            <BarButton
              key={bank.id}
              label={bank.name}
              palette={palette}
              isActive={bank.id === soundBanks.selectedId}
              onPress={() => onSelect(bank.id)}
            />
          ))
        : null}
      {isOpen && selected?.isRemovable === true ? (
        <BarButton label={`Remove ${selected.name}`} palette={palette} onPress={() => onRemove(selected.id)} />
      ) : null}
      {isOpen ? <BarButton label="Add SoundFont…" palette={palette} isAccent onPress={onAdd} /> : null}
    </Group>
  );
}
