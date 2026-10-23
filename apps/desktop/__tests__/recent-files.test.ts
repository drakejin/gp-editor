import {
  MAX_RECENT_FILES,
  type RecentFile,
  clearRecentFiles,
  markRecentFileMissing,
  normalizeRecentFiles,
  parseRecentFiles,
  pinRecentFile,
  recentFileFolder,
  rememberRecentFile,
  removeRecentFile,
  unpinRecentFile,
} from '../src/lib/recent-files';

function file(name: string, openedAt: number, isPinned = false): RecentFile {
  return { path: `/scores/${name}`, name, isPinned, openedAt, isMissing: false };
}

function names(files: readonly RecentFile[]): string[] {
  return files.map((each) => each.name);
}

/** Files a.gp5 … opened one after another (the last one most recently), in the list's order: newest first. */
function opened(...fileNames: string[]): readonly RecentFile[] {
  return fileNames.reduce<readonly RecentFile[]>((files, name, i) => rememberRecentFile(files, { path: `/scores/${name}`, name }, i + 1), []);
}

describe('rememberRecentFile', () => {
  it('lists files newest first', () => {
    const files = opened('a.gp5', 'b.gp5', 'c.gp5');
    expect(names(files)).toEqual(['c.gp5', 'b.gp5', 'a.gp5']);
  });

  it('moves a file opened again to the top instead of listing it twice', () => {
    // Arrange
    const files = opened('a.gp5', 'b.gp5', 'c.gp5');

    // Act
    const next = rememberRecentFile(files, { path: '/scores/a.gp5', name: 'a.gp5' }, 10);

    // Assert
    expect(names(next)).toEqual(['a.gp5', 'c.gp5', 'b.gp5']);
    expect(next[0]?.openedAt).toBe(10);
  });

  it('keeps at most 20 files, dropping the oldest', () => {
    // Arrange
    const many = Array.from({ length: MAX_RECENT_FILES + 3 }, (_, i) => `f${i}.gp5`);

    // Act
    const files = opened(...many);

    // Assert
    expect(files).toHaveLength(MAX_RECENT_FILES);
    expect(files[0]?.name).toBe('f22.gp5');
    expect(files.at(-1)?.name).toBe('f3.gp5');
  });

  it('keeps a pinned file in its place when it is opened again, and takes its new name', () => {
    // Arrange
    const files = pinRecentFile(opened('a.gp5', 'b.gp5'), '/scores/a.gp5');

    // Act
    const next = rememberRecentFile(files, { path: '/scores/a.gp5', name: 'A.gp5' }, 10);

    // Assert
    expect(names(next)).toEqual(['A.gp5', 'b.gp5']);
    expect(next[0]).toMatchObject({ isPinned: true, openedAt: 10 });
  });

  it('never pushes a pinned file out: new files replace the oldest unpinned ones', () => {
    // Arrange
    const oldest = pinRecentFile(opened('old.gp5'), '/scores/old.gp5');
    const many = Array.from({ length: MAX_RECENT_FILES + 5 }, (_, i) => `f${i}.gp5`);

    // Act
    const files = many.reduce((list, name, i) => rememberRecentFile(list, { path: `/scores/${name}`, name }, 100 + i), oldest);

    // Assert
    expect(files).toHaveLength(MAX_RECENT_FILES);
    expect(files[0]).toMatchObject({ name: 'old.gp5', isPinned: true });
    expect(files[1]?.name).toBe('f24.gp5');
  });

  it('lists no new file once all 20 are pinned', () => {
    // Arrange
    const many = Array.from({ length: MAX_RECENT_FILES }, (_, i) => `f${i}.gp5`);
    const pinned = many.reduce((list, name) => pinRecentFile(list, `/scores/${name}`), opened(...many));

    // Act
    const files = rememberRecentFile(pinned, { path: '/scores/new.gp5', name: 'new.gp5' }, 1000);

    // Assert
    expect(files).toEqual(pinned);
  });

  it('clears the missing mark of a file found again', () => {
    const files = markRecentFileMissing(opened('a.gp5'), '/scores/a.gp5');
    const next = rememberRecentFile(files, { path: '/scores/a.gp5', name: 'a.gp5' }, 5);
    expect(next[0]?.isMissing).toBe(false);
  });

  it('replaces the entry of a file that moved, keeping its pin', () => {
    // Arrange
    const files = pinRecentFile(opened('a.gp5', 'b.gp5'), '/scores/b.gp5');

    // Act
    const next = rememberRecentFile(files, { path: '/moved/b.gp5', name: 'b.gp5' }, 9, '/scores/b.gp5');

    // Assert
    expect(next.map((each) => each.path)).toEqual(['/moved/b.gp5', '/scores/a.gp5']);
    expect(next[0]?.isPinned).toBe(true);
  });

  it('ignores a file without a path (a new sheet that was never saved)', () => {
    const files = opened('a.gp5');
    expect(rememberRecentFile(files, { path: '', name: 'Untitled.gp5' }, 9)).toBe(files);
  });
});

describe('pinRecentFile and unpinRecentFile', () => {
  it('puts pinned files on top in the order they were pinned', () => {
    // Arrange
    const files = opened('a.gp5', 'b.gp5', 'c.gp5', 'd.gp5');

    // Act
    const pinned = pinRecentFile(pinRecentFile(files, '/scores/b.gp5'), '/scores/a.gp5');

    // Assert
    expect(names(pinned)).toEqual(['b.gp5', 'a.gp5', 'd.gp5', 'c.gp5']);
    expect(pinned.map((each) => each.isPinned)).toEqual([true, true, false, false]);
  });

  it('keeps pinned files on top when other files are opened', () => {
    const files = pinRecentFile(opened('a.gp5', 'b.gp5'), '/scores/a.gp5');
    const next = rememberRecentFile(files, { path: '/scores/c.gp5', name: 'c.gp5' }, 50);
    expect(names(next)).toEqual(['a.gp5', 'c.gp5', 'b.gp5']);
  });

  it('puts an unpinned file back among the others by when it was last opened', () => {
    // Arrange
    const files = pinRecentFile(opened('a.gp5', 'b.gp5', 'c.gp5'), '/scores/a.gp5');

    // Act
    const next = unpinRecentFile(files, '/scores/a.gp5');

    // Assert
    expect(names(next)).toEqual(['c.gp5', 'b.gp5', 'a.gp5']);
    expect(next.some((each) => each.isPinned)).toBe(false);
  });

  it('changes nothing for a path that is not listed, or a file already pinned', () => {
    const files = pinRecentFile(opened('a.gp5', 'b.gp5'), '/scores/a.gp5');
    expect(pinRecentFile(files, '/elsewhere/x.gp5')).toBe(files);
    expect(pinRecentFile(files, '/scores/a.gp5')).toBe(files);
    expect(unpinRecentFile(files, '/scores/b.gp5')).toBe(files);
  });
});

describe('removeRecentFile, clearRecentFiles and markRecentFileMissing', () => {
  it('removes one file', () => {
    expect(names(removeRecentFile(opened('a.gp5', 'b.gp5'), '/scores/a.gp5'))).toEqual(['b.gp5']);
  });

  it('clears every file but the pinned ones', () => {
    const files = pinRecentFile(opened('a.gp5', 'b.gp5', 'c.gp5'), '/scores/b.gp5');
    expect(names(clearRecentFiles(files))).toEqual(['b.gp5']);
  });

  it('marks a file missing in its place', () => {
    // Arrange
    const files = opened('a.gp5', 'b.gp5');

    // Act
    const next = markRecentFileMissing(files, '/scores/a.gp5');

    // Assert
    expect(names(next)).toEqual(['b.gp5', 'a.gp5']);
    expect(next.map((each) => each.isMissing)).toEqual([false, true]);
    expect(markRecentFileMissing(next, '/scores/a.gp5')).toBe(next);
  });
});

describe('normalizeRecentFiles', () => {
  it('orders pinned first (as listed) then the rest newest first, one entry per path', () => {
    // Arrange
    const files = [file('old.gp5', 1), file('p2.gp5', 2, true), file('new.gp5', 9), file('p1.gp5', 3, true), file('new.gp5', 4)];

    // Act
    const normalized = normalizeRecentFiles(files);

    // Assert
    expect(names(normalized)).toEqual(['p2.gp5', 'p1.gp5', 'new.gp5', 'old.gp5']);
    expect(normalized[2]?.openedAt).toBe(9);
  });
});

describe('parseRecentFiles', () => {
  it('keeps well-formed entries from the stored list', () => {
    const stored: unknown = [{ path: '/scores/a.gp5', name: 'a.gp5', isPinned: true, openedAt: 7, isMissing: true }];
    expect(parseRecentFiles(stored)).toEqual([{ path: '/scores/a.gp5', name: 'a.gp5', isPinned: true, openedAt: 7, isMissing: true }]);
  });

  it('drops entries that are not files with an absolute path, and fills in what is missing', () => {
    // Arrange
    const stored: unknown = [
      null,
      'a.gp5',
      { path: 'relative.gp5', name: 'relative.gp5' },
      { path: '', name: 'empty' },
      { path: 42 },
      { path: '/scores/b.gp5', openedAt: Number.NaN },
    ];

    // Act
    const files = parseRecentFiles(stored);

    // Assert
    expect(files).toEqual([{ path: '/scores/b.gp5', name: 'b.gp5', isPinned: false, openedAt: 0, isMissing: false }]);
  });

  it('reads anything but a list as no files', () => {
    expect(parseRecentFiles({ path: '/a.gp5' })).toEqual([]);
    expect(parseRecentFiles(undefined)).toEqual([]);
  });

  it('orders, de-duplicates and caps what it read', () => {
    const stored: unknown = Array.from({ length: 30 }, (_, i) => ({ path: `/s/${i % 25}.gp5`, name: `${i}.gp5`, openedAt: i }));
    const files = parseRecentFiles(stored);
    expect(files).toHaveLength(MAX_RECENT_FILES);
    expect(new Set(files.map((each) => each.path)).size).toBe(MAX_RECENT_FILES);
  });
});

describe('recentFileFolder', () => {
  it('names the folder holding the file, with a home folder as ~', () => {
    expect(recentFileFolder('/Users/jin/Music/Tabs/a.gp5')).toBe('~/Music/Tabs');
    expect(recentFileFolder('/Users/jin/a.gp5')).toBe('~');
    expect(recentFileFolder('/Volumes/Disk/a.gp5')).toBe('/Volumes/Disk');
    expect(recentFileFolder('/a.gp5')).toBe('/');
  });
});
