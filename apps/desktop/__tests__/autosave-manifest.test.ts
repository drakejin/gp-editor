import { type AutosaveManifest, manifestText, parseManifest } from '../src/autosave/autosave-manifest';

const MANIFEST: AutosaveManifest = {
  version: 1,
  documentId: '20261104-101500-k3f9-tab-1',
  title: 'Canon',
  fileName: 'Canon.gp5',
  path: '/Users/me/Music/Canon.gp5',
  format: 'gp5',
  savedAt: '2026-11-04T10:15:30.000Z',
  session: { id: '20261104-101500-k3f9', pid: 4242, bootId: 'BAA8756F-444D-4F6E-8783-5D2A67D4F287' },
  status: 'unsaved',
  writeMs: 412,
};

describe('autosave manifest', () => {
  it('reads back what it writes', () => {
    // Act
    const read = parseManifest(manifestText(MANIFEST));

    // Assert
    expect(read).toEqual(MANIFEST);
  });

  it('reads a session without a boot id (the boot is then not known)', () => {
    const noBoot = { ...MANIFEST, session: { id: 'old', pid: 7 } };
    expect(parseManifest(manifestText(noBoot))).toEqual(noBoot);
  });

  it('reads a new song’s manifest: no path and no format', () => {
    const fresh = { ...MANIFEST, fileName: 'Untitled', path: '', format: '' };
    expect(parseManifest(manifestText(fresh))).toEqual(fresh);
  });

  it('refuses text that is no JSON object, or of another version', () => {
    expect(parseManifest('not json')).toBeUndefined();
    expect(parseManifest('[]')).toBeUndefined();
    expect(parseManifest(manifestText({ ...MANIFEST, version: 2 as 1 }))).toBeUndefined();
  });

  it('refuses ids that could name another folder, an unknown status or a bad time', () => {
    expect(parseManifest(manifestText({ ...MANIFEST, documentId: '../escape' }))).toBeUndefined();
    expect(parseManifest(manifestText({ ...MANIFEST, session: { id: 'a/b', pid: 1 } }))).toBeUndefined();
    expect(parseManifest(manifestText({ ...MANIFEST, session: { id: 'ok', pid: -1 } }))).toBeUndefined();
    expect(parseManifest(manifestText({ ...MANIFEST, session: { id: 'ok', pid: 1, bootId: 'not a uuid' } }))).toBeUndefined();
    expect(parseManifest(manifestText({ ...MANIFEST, status: 'lost' as 'unsaved' }))).toBeUndefined();
    expect(parseManifest(manifestText({ ...MANIFEST, savedAt: 'yesterday' }))).toBeUndefined();
  });

  it('reads only its own properties and keeps texts bounded', () => {
    // Arrange
    const inherited = Object.create({ status: 'unsaved' }) as Record<string, unknown>;
    Object.assign(inherited, { ...MANIFEST });
    delete inherited.status;
    const long = { ...MANIFEST, title: 'x'.repeat(10_000) };

    // Act
    const fromPrototype = parseManifest(JSON.stringify(inherited));
    const longTitle = parseManifest(manifestText(long));

    // Assert
    expect(fromPrototype).toBeUndefined();
    expect(longTitle?.title.length).toBeLessThanOrEqual(500);
  });

  it('leaves out a write time that is not a sensible number', () => {
    const odd = JSON.parse(manifestText(MANIFEST)) as Record<string, unknown>;
    expect(parseManifest(JSON.stringify({ ...odd, writeMs: 'slow' }))?.writeMs).toBeUndefined();
  });
});
