import { isPdfPath } from '../src/hooks/use-document';

describe('isPdfPath', () => {
  it('recognises PDF paths and file URLs, whatever the case', () => {
    expect(isPdfPath('/a/Song.pdf')).toBe(true);
    expect(isPdfPath('file:///a/My%20Song.PDF')).toBe(true);
    expect(isPdfPath('/a/Song.gp5')).toBe(false);
  });
});
