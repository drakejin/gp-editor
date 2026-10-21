import { base64ToBytes } from '../src/lib/base64';

describe('base64ToBytes', () => {
  it('decodes padded and unpadded input', () => {
    expect([...base64ToBytes('AAEC/w==')]).toEqual([0, 1, 2, 255]);
    expect([...base64ToBytes('aGk')]).toEqual([0x68, 0x69]);
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base64ToBytes('ab$c')).toThrow('Invalid base64');
  });
});
