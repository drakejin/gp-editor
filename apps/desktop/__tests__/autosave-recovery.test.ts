import type { AutosaveManifest, AutosaveStatus } from '../src/autosave/autosave-manifest';
import { manifestText } from '../src/autosave/autosave-manifest';
import { type AutosaveEntry, MAX_LISTED_WORK, keptWork, parseEntries, recoverableWork } from '../src/autosave/autosave-recovery';

const CRASHED = { id: 'crashed', pid: 100 };
const RUNNING = { id: 'running', pid: 200 };
const ME = { id: 'me', pid: 300 };

function entry(documentId: string, day: string, status: AutosaveStatus, session = CRASHED, savedAt = `${day}T10:00:00.000Z`): AutosaveEntry {
  const manifest: AutosaveManifest = {
    version: 1,
    documentId,
    title: documentId,
    fileName: `${documentId}.gp5`,
    path: `/scores/${documentId}.gp5`,
    format: 'gp5',
    savedAt,
    session,
    status,
  };
  return { folder: `${day}/${documentId}`, manifest };
}

const isRunning = (session: { readonly pid: number }) => session.pid === RUNNING.pid || session.pid === ME.pid;

describe('recoverableWork: what the launch question offers', () => {
  it('offers the unsaved work of sessions that ended without saving or letting it go', () => {
    // Arrange
    const entries = [
      entry('a', '2026-11-03', 'unsaved'),
      entry('b', '2026-11-03', 'saved'),
      entry('c', '2026-11-03', 'discarded'),
      entry('d', '2026-11-03', 'declined'),
      entry('e', '2026-11-04', 'unsaved', RUNNING),
      entry('f', '2026-11-04', 'unsaved', ME),
    ];

    // Act
    const work = recoverableWork(entries, ME.id, isRunning);

    // Assert
    expect(work.map((each) => each.documentId)).toEqual(['a']);
  });

  it('offers a document once, from its newest snapshot, with every snapshot of it to answer for', () => {
    // Arrange
    const older = entry('a', '2026-11-03', 'unsaved');
    const newer = entry('a', '2026-11-04', 'unsaved');
    const other = entry('b', '2026-11-02', 'unsaved');

    // Act
    const work = recoverableWork([older, other, newer], ME.id, isRunning);

    // Assert
    expect(work.map((each) => [each.documentId, each.newest.folder])).toEqual([
      ['a', '2026-11-04/a'],
      ['b', '2026-11-02/b'],
    ]);
    expect(work[0]?.entries).toEqual([older, newer]);
  });

  it('lists at most MAX_LISTED_WORK documents, the newest first', () => {
    const entries = Array.from({ length: MAX_LISTED_WORK + 5 }, (_, index) =>
      entry(`doc${index}`, '2026-11-04', 'unsaved', CRASHED, new Date(Date.UTC(2026, 10, 4, 0, index)).toISOString()),
    );
    const work = recoverableWork(entries, ME.id, isRunning);
    expect(work).toHaveLength(MAX_LISTED_WORK);
    expect(work[0]?.documentId).toBe(`doc${MAX_LISTED_WORK + 4}`);
  });
});

describe('keptWork: what File ▸ Recover Autosaved Work… lists', () => {
  it('lists unsaved work of ended sessions, and work declined or let go — never what is live, saved or carried on', () => {
    // Arrange
    const entries = [
      entry('a', '2026-11-03', 'unsaved'),
      entry('b', '2026-11-03', 'saved'),
      entry('c', '2026-11-03', 'discarded', ME),
      entry('d', '2026-11-03', 'declined'),
      entry('e', '2026-11-04', 'unsaved', ME),
      entry('f', '2026-11-04', 'restored'),
      entry('g', '2026-11-04', 'replaced'),
    ];

    // Act
    const work = keptWork(entries, ME.id, isRunning);

    // Assert
    expect(work.map((each) => each.documentId).sort()).toEqual(['a', 'c', 'd']);
  });
});

describe('parseEntries: the native list read back', () => {
  it('keeps the entries whose folder and manifest are well formed and agree', () => {
    // Arrange
    const good = entry('a', '2026-11-04', 'unsaved');
    const raw = [
      { folder: good.folder, manifest: manifestText(good.manifest) },
      { folder: '2026-11-04/other', manifest: manifestText(good.manifest) },
      { folder: '../a', manifest: manifestText(good.manifest) },
      { folder: '2026-11-04/b', manifest: 'not json' },
      'nonsense',
    ];

    // Act
    const entries = parseEntries(raw);

    // Assert
    expect(entries).toEqual([good]);
    expect(parseEntries({})).toEqual([]);
  });
});
