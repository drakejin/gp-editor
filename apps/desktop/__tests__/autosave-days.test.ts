import {
  AUTOSAVE_KEEP_DAYS,
  dayName,
  documentIdOf,
  formatOf,
  isDayName,
  isFolderId,
  newSessionId,
  oldestKeptDay,
  snapshotFolder,
} from '../src/autosave/autosave-days';

describe('autosave days and names', () => {
  it('names a day by its local date, as the folder of that day’s snapshots', () => {
    expect(dayName(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
    expect(dayName(new Date(2026, 0, 9, 0, 0))).toBe('2026-01-09');
  });

  it('tells a day’s folder name from anything else', () => {
    expect(isDayName('2026-11-04')).toBe(true);
    expect(isDayName('2026-11-4')).toBe(false);
    expect(isDayName('../2026-11-04')).toBe(false);
  });

  it('keeps the last days’ folders: the oldest kept is AUTOSAVE_KEEP_DAYS before today, across a month’s start', () => {
    expect(AUTOSAVE_KEEP_DAYS).toBe(7);
    expect(oldestKeptDay(new Date(2026, 10, 4, 10, 0))).toBe('2026-10-28');
    expect(oldestKeptDay(new Date(2026, 2, 3), 3)).toBe('2026-02-28');
  });

  it('puts a document’s snapshot in a folder of its own inside the day’s', () => {
    expect(snapshotFolder('2026-11-04', 'abc-tab-1')).toBe('2026-11-04/abc-tab-1');
  });

  it('makes a session id from the time and a random part, and a document id from it and the tab', () => {
    // Act
    const session = newSessionId(new Date(2026, 10, 4, 10, 15, 30), () => 0.5);
    const documentId = documentIdOf(session, 'tab-3');

    // Assert
    expect(session).toMatch(/^20261104-101530-[0-9a-z]{4}$/);
    expect(documentId).toBe(`${session}-tab-3`);
    expect(isFolderId(documentId)).toBe(true);
  });

  it('refuses folder ids that could name another folder', () => {
    expect(isFolderId('')).toBe(false);
    expect(isFolderId('a/b')).toBe(false);
    expect(isFolderId('..')).toBe(false);
    expect(isFolderId('x'.repeat(81))).toBe(false);
  });

  it('names the format a file was opened from by its extension; none for a new song', () => {
    expect(formatOf('/scores/Canon.GP5')).toBe('gp5');
    expect(formatOf('/scores/song.musicxml')).toBe('musicxml');
    expect(formatOf('')).toBe('');
    expect(formatOf('/scores/README')).toBe('');
  });
});
