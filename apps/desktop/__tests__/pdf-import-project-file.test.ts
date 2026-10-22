import { newImportProject, pageFile, parseImportProject, serializeImportProject } from '../src/pdf-import/project-file';

const CREATED = { path: '/Users/me/Documents/GP Editor Projects/Etude', name: 'Etude', sourceFile: 'Etude.pdf', pageCount: 3 };
const NOW = new Date('2026-10-22T10:00:00.000Z');

describe('import project file', () => {
  it('starts a project transcribing, with no pages done', () => {
    expect(newImportProject(CREATED, 'claude-opus-5-5', NOW)).toEqual({
      version: 1,
      name: 'Etude',
      sourceFile: 'Etude.pdf',
      pageCount: 3,
      model: 'claude-opus-5-5',
      createdAt: '2026-10-22T10:00:00.000Z',
      status: 'transcribing',
      pagesDone: [],
      failedPages: [],
      warnings: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it('reads back what it wrote', () => {
    const project = { ...newImportProject(CREATED, 'claude-opus-5-5', NOW), status: 'done' as const, pagesDone: [1, 2, 3], songFile: 'Etude.gp5' };
    expect(parseImportProject(serializeImportProject(project))).toEqual(project);
  });

  it('reads nothing from a missing, broken or foreign file', () => {
    expect(parseImportProject(null)).toBeUndefined();
    expect(parseImportProject('{')).toBeUndefined();
    expect(parseImportProject('{"version": 2}')).toBeUndefined();
    expect(parseImportProject(JSON.stringify({ ...newImportProject(CREATED, 'm', NOW), status: 'exploded' }))).toBeUndefined();
    expect(parseImportProject(JSON.stringify({ ...newImportProject(CREATED, 'm', NOW), pageCount: -1 }))).toBeUndefined();
  });

  it('names page files so they sort in page order', () => {
    expect(pageFile(1)).toBe('pages/page-001.json');
    expect(pageFile(12)).toBe('pages/page-012.json');
  });
});
