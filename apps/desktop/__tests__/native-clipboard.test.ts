import { readBeats, writeBeats } from '../src/native/clipboard';

describe('native clipboard without the native module (tests, other platforms)', () => {
  it('writes nothing and reads no beats', async () => {
    await expect(writeBeats('{}', '1 beat from bar 1')).resolves.toBeUndefined();
    await expect(readBeats()).resolves.toBeNull();
  });
});
