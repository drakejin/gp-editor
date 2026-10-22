import { newImportProject } from '../src/pdf-import/project-file';
import { importProgressText, projectStatusText } from '../src/pdf-import/status';

const BASE = newImportProject({ path: '/p/Etude', name: 'Etude', sourceFile: 'Etude.pdf', pageCount: 5 }, 'claude-opus-5-5', new Date(0));

describe('import status texts', () => {
  it('describes each state of a project for the project list', () => {
    expect(projectStatusText({ ...BASE, pagesDone: [1, 2] })).toBe('Transcribing · 2 of 5 pages');
    expect(projectStatusText({ ...BASE, status: 'done', pagesDone: [1, 2, 3, 4, 5] })).toBe('Done · 5 pages');
    expect(projectStatusText({ ...BASE, status: 'partial', pagesDone: [1, 2, 4] })).toBe('3 of 5 pages · resume for the rest');
    expect(projectStatusText({ ...BASE, status: 'failed', error: 'Your credit balance is too low' })).toBe('Stopped: Your credit balance is too low');
    expect(projectStatusText({ ...BASE, status: 'cancelled', pagesDone: [1] })).toBe('Cancelled · 1 of 5 pages');
  });

  it('shows progress and tokens while importing', () => {
    const running = { ...BASE, pagesDone: [1, 2], usage: { inputTokens: 12_400, outputTokens: 5_300 } };
    expect(importProgressText(running, 'Claude Opus 5.5')).toBe('Importing “Etude” with Claude Opus 5.5 — 2 of 5 pages · 17.7k tokens');
  });
});
