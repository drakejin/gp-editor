import ReactTestRenderer from 'react-test-renderer';
import { type SoundBankCommands, useSoundBanks } from '../src/hooks/use-sound-banks';
import type { SoundBanks } from '../src/native/player';

const BUNDLED = { id: 'generaluser', name: 'GeneralUser GS', isRemovable: false };
const MACOS = { id: 'macos', name: 'macOS (Roland GS)', isRemovable: false };
const MINE = { id: 'file:Mine.sf2', name: 'Mine', isRemovable: true };
const STATE: SoundBanks = { banks: [BUNDLED, MACOS], selectedId: 'generaluser' };

const mockNative = {
  load: jest.fn<Promise<SoundBanks>, []>(),
  select: jest.fn<Promise<SoundBanks>, [string]>(),
  add: jest.fn<Promise<SoundBanks | null>, []>(),
  remove: jest.fn<Promise<SoundBanks>, [string]>(),
};

jest.mock('../src/native/player', () => ({
  loadSoundBanks: () => mockNative.load(),
  selectSoundBank: (id: string) => mockNative.select(id),
  addSoundBank: () => mockNative.add(),
  removeSoundBank: (id: string) => mockNative.remove(id),
}));

async function renderHook(onChanged: () => void): Promise<() => SoundBankCommands> {
  let latest: SoundBankCommands | undefined;
  function Probe() {
    latest = useSoundBanks(onChanged);
    return null;
  }
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<Probe />);
  });
  return () => latest!;
}

async function run(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.load.mockResolvedValue(STATE);
});

describe('useSoundBanks', () => {
  it('loads the banks and the selected one', async () => {
    const current = await renderHook(jest.fn());
    expect(current().soundBanks).toEqual(STATE);
  });

  it('selects a bank and tells the caller, so playback can restart with it', async () => {
    // Arrange
    const onChanged = jest.fn();
    mockNative.select.mockResolvedValue({ ...STATE, selectedId: 'macos' });
    const current = await renderHook(onChanged);

    // Act
    await run(() => current().select('macos'));

    // Assert
    expect(mockNative.select).toHaveBeenCalledWith('macos');
    expect(current().soundBanks.selectedId).toBe('macos');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('adds a SoundFont, and changes nothing when the open panel is cancelled', async () => {
    const onChanged = jest.fn();
    const current = await renderHook(onChanged);
    mockNative.add.mockResolvedValueOnce(null);
    await run(() => current().add());
    expect(onChanged).not.toHaveBeenCalled();
    mockNative.add.mockResolvedValueOnce({ banks: [BUNDLED, MACOS, MINE], selectedId: MINE.id });
    await run(() => current().add());
    expect(current().soundBanks.selectedId).toBe(MINE.id);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('removes an added bank', async () => {
    mockNative.load.mockResolvedValue({ banks: [BUNDLED, MINE], selectedId: MINE.id });
    mockNative.remove.mockResolvedValue({ banks: [BUNDLED], selectedId: BUNDLED.id });
    const current = await renderHook(jest.fn());
    await run(() => current().remove(MINE.id));
    expect(current().soundBanks).toEqual({ banks: [BUNDLED], selectedId: BUNDLED.id });
  });

  it('shows what failed until dismissed', async () => {
    const current = await renderHook(jest.fn());
    mockNative.add.mockRejectedValueOnce(new Error('Choose a SoundFont (.sf2) or DLS (.dls) file'));
    await run(() => current().add());
    expect(current().error).toBe('Choose a SoundFont (.sf2) or DLS (.dls) file');
    await run(() => current().dismissError());
    expect(current().error).toBeUndefined();
  });
});
