import { hexColorText, isSameColor, parseHexColor } from '../src/lib/track-color';

describe('track colour text', () => {
  it('reads #RRGGBB, RRGGBB and #RGB in any case, and nothing else', () => {
    expect(parseHexColor('#ED7474')).toEqual({ r: 237, g: 116, b: 116 });
    expect(parseHexColor(' 75cbde ')).toEqual({ r: 117, g: 203, b: 222 });
    expect(parseHexColor('#f80')).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseHexColor('#12345')).toBeUndefined();
    expect(parseHexColor('red')).toBeUndefined();
    expect(parseHexColor('')).toBeUndefined();
  });

  it('writes a colour as #RRGGBB in capitals, and compares colours by value', () => {
    expect(hexColorText({ r: 237, g: 116, b: 5 })).toBe('#ED7405');
    expect(isSameColor({ r: 1, g: 2, b: 3 }, { r: 1, g: 2, b: 3 })).toBe(true);
    expect(isSameColor({ r: 1, g: 2, b: 3 }, { r: 1, g: 2, b: 4 })).toBe(false);
  });
});
