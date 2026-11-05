import { platformText } from '../web/platform-text';

describe('platformText (the Windows build’s texts)', () => {
  it('writes a click with a modifier the Windows way, in English and Korean', () => {
    expect(platformText('⌥-click: in the cursor’s track only')).toBe('Alt+click: in the cursor’s track only');
    expect(platformText('right-click or ⌃-click a beat')).toBe('right-click or Ctrl+click a beat');
    expect(platformText('⌥-클릭: 이 트랙에만')).toBe('Alt+클릭: 이 트랙에만');
  });

  it('keeps the minus key after a modifier a key', () => {
    expect(platformText('Zoom (⌘- / ⌘= / ⌘0)')).toBe('Zoom (Ctrl+- / Ctrl+= / Ctrl+0)');
    expect(platformText('Slower (⌥-)')).toBe('Slower (Alt+-)');
  });
});
