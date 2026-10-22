import ReactTestRenderer from 'react-test-renderer';
import { BarButton } from '../src/components/BarButton';
import { SoundBankGroup } from '../src/components/SoundBankGroup';
import type { SoundBanks } from '../src/native/player';
import { PALETTE } from '../test-support/score-helpers';

const BANKS: SoundBanks = {
  banks: [
    { id: 'generaluser', name: 'GeneralUser GS', isRemovable: false },
    { id: 'macos', name: 'macOS (Roland GS)', isRemovable: false },
    { id: 'file:Mine.sf2', name: 'Mine', isRemovable: true },
  ],
  selectedId: 'generaluser',
};

function render(soundBanks: SoundBanks) {
  const handlers = { onSelect: jest.fn(), onAdd: jest.fn(), onRemove: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SoundBankGroup soundBanks={soundBanks} palette={PALETTE} {...handlers} />);
  });
  const labels = () => renderer.root.findAllByType(BarButton).map((button) => button.props.label as string);
  const press = (label: string) => {
    const button = renderer.root.findAllByType(BarButton).find((candidate) => candidate.props.label === label);
    if (button === undefined) {
      throw new Error(`no button "${label}"`);
    }
    ReactTestRenderer.act(() => button.props.onPress());
  };
  return { labels, press, ...handlers };
}

describe('SoundBankGroup', () => {
  it('shows the selected bank on one button until opened', () => {
    expect(render(BANKS).labels()).toEqual(['GeneralUser GS ▾']);
  });

  it('lists every bank and Add SoundFont… when opened; a click selects', () => {
    // Arrange
    const group = render(BANKS);

    // Act
    group.press('GeneralUser GS ▾');
    group.press('macOS (Roland GS)');

    // Assert
    expect(group.labels()).toEqual(['GeneralUser GS ▴', 'GeneralUser GS', 'macOS (Roland GS)', 'Mine', 'Add SoundFont…']);
    expect(group.onSelect).toHaveBeenCalledWith('macos');
  });

  it('offers Remove for a selected bank the user added, and Add SoundFont…', () => {
    const group = render({ ...BANKS, selectedId: 'file:Mine.sf2' });
    group.press('Mine ▾');
    group.press('Remove Mine');
    group.press('Add SoundFont…');
    expect(group.onRemove).toHaveBeenCalledWith('file:Mine.sf2');
    expect(group.onAdd).toHaveBeenCalled();
  });

  it('names the player’s own bank when there is none to choose', () => {
    expect(render({ banks: [], selectedId: '' }).labels()).toEqual(['Built-in ▾']);
  });
});
