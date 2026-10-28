import type { Command, CommandState } from '../src/lib/command-types';
import { MAX_RECENT_COMMANDS, matchScore, moveHighlight, rememberCommand, searchCommands, searchWords, visibleRows } from '../src/lib/command-search';
import { allCommands, appCommands } from '../src/lib/commands';
import { setLanguage } from '../src/lib/i18n/i18n';

const OPEN_DOCUMENT: CommandState = { hasDocument: true, hasSelection: false, canUndo: false, canRedo: false, tabCount: 1, isPercussion: false, palette: { keySignature: 0 } };
const NO_DOCUMENT: CommandState = { ...OPEN_DOCUMENT, hasDocument: false, tabCount: 0 };

function command(id: string, title: string, extra: Partial<Command> = {}): Command {
  return { id, title, group: 'Test', keywords: [], isEnabled: () => true, run: () => undefined, ...extra };
}

function ids(query: string, state: CommandState = OPEN_DOCUMENT, recent: readonly string[] = [], commands: readonly Command[] = allCommands()): string[] {
  return searchCommands(commands, query, state, recent).map((match) => match.command.id);
}

describe('command search', () => {
  it('finds Export PDF… from “exp pdf” and Transpose… from “transpose”', () => {
    expect(ids('exp pdf')[0]).toBe('file.exportPdf');
    expect(ids('transpose')[0]).toBe('tools.transpose');
    expect(ids('save as')[0]).toBe('file.saveAs');
    expect(ids('let ring')[0]).toBe('note.letRing');
  });

  it('finds by keyword, by group and by letters in order', () => {
    expect(ids('semitone')).toContain('tools.transpose');
    expect(ids('ai')).toEqual(expect.arrayContaining(['file.importPdf', 'edit.songWriter']));
    expect(ids('xprt')).toContain('file.exportMidi');
    expect(ids('playback')).toContain('play.loop');
  });

  it('drops a command when one typed word is not found', () => {
    expect(ids('export banana')).toEqual([]);
    expect(matchScore(command('a', 'Export PDF…'), 'export banana')).toBeUndefined();
  });

  it('scores whole words over prefixes, prefixes over keywords, keywords over the group', () => {
    const subject = command('a', 'Export PDF…', { keywords: ['paper'], group: 'File' });
    const scores = ['pdf', 'pd', 'paper', 'file', 'xport', 'xpp'].map((query) => matchScore(subject, query) ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(matchScore(subject, '')).toBe(0);
  });

  it('lists recently used commands first when nothing is typed, newest first, then the registry’s order', () => {
    const commands = [command('a', 'Alpha'), command('b', 'Beta'), command('c', 'Gamma'), command('d', 'Delta')];
    expect(ids('', OPEN_DOCUMENT, ['c', 'a'], commands)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('puts a recently used command first among equal matches, but a better match before it', () => {
    const commands = [command('a', 'Export PDF…'), command('b', 'Export PNG…'), command('c', 'Exporter')];
    expect(ids('export', OPEN_DOCUMENT, ['b'], commands)).toEqual(['b', 'a', 'c']);
  });

  it('lists the commands that cannot run after the ones that can', () => {
    const order = ids('new', NO_DOCUMENT);
    const firstDisabled = searchCommands(allCommands(), 'new', NO_DOCUMENT, []).findIndex((match) => !match.isEnabled);
    expect(order[0]).toBe('file.new');
    expect(searchCommands(allCommands(), 'new', NO_DOCUMENT, []).slice(firstDisabled).every((match) => !match.isEnabled)).toBe(true);
  });

  it('splits titles into lower-case words', () => {
    expect(searchWords('Export ASCII Tab…')).toEqual(['export', 'ascii', 'tab']);
    expect(searchWords('Playback Tempo +5 BPM')).toEqual(['playback', 'tempo', '+5', 'bpm']);
  });
});

describe('command search in Korean', () => {
  beforeEach(() => setLanguage('ko'));
  afterEach(() => setLanguage('en'));

  const koreanIds = (query: string): string[] => searchCommands(appCommands(), query, OPEN_DOCUMENT, []).map((match) => match.command.id);

  it('lists the registry with Korean titles and groups', () => {
    const tuner = appCommands().find((candidate) => candidate.id === 'tools.tuner');
    expect(tuner).toMatchObject({ title: '튜너…', group: '도구' });
  });

  it('finds a command by its Korean words, a word’s start and a syllable still being typed', () => {
    expect(koreanIds('조옮김')[0]).toBe('tools.transpose');
    expect(koreanIds('pdf 내보')[0]).toBe('file.exportPdf');
    expect(koreanIds('튠')[0]).toBe('tools.tuner');
  });

  it('finds a command by the initial consonants of its Korean title (초성)', () => {
    expect(koreanIds('ㅌㄴ')[0]).toBe('tools.tuner');
    expect(koreanIds('ㅈㅇㄱ')[0]).toBe('tools.transpose');
    expect(koreanIds('ㄷㄹㅇㄹ ㅈㅈ')).toContain('file.saveAs');
  });

  it('still finds a command by its English title and keywords', () => {
    expect(koreanIds('transpose')[0]).toBe('tools.transpose');
    expect(koreanIds('semitone')).toContain('tools.transpose');
    expect(koreanIds('exp pdf')[0]).toBe('file.exportPdf');
    expect(koreanIds('let ring')[0]).toBe('note.letRing');
  });

  it('splits Korean titles into words, keeping the jamo typed alone', () => {
    expect(searchWords('PDF로 내보내기…')).toEqual(['pdf로', '내보내기']);
    expect(searchWords('ㅌㄴ 튜너')).toEqual(['ㅌㄴ', '튜너']);
  });

  it('scores a 초성 match below a word’s start and above the group', () => {
    const subject = command('a', '조옮김…', { group: '도구' });
    const scores = ['조옮', 'ㅈㅇ', '도구'].map((query) => matchScore(subject, query) ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(new Set(scores).size).toBe(3);
  });
});

describe('recent commands and the highlighted row', () => {
  it('remembers each command once, newest first, up to the limit', () => {
    const many = Array.from({ length: MAX_RECENT_COMMANDS }, (_, i) => `c${i}`);
    expect(rememberCommand(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(rememberCommand(many, 'new')).toEqual(['new', ...many.slice(0, MAX_RECENT_COMMANDS - 1)]);
  });

  it('goes round the list with ↑ and ↓', () => {
    expect(moveHighlight(0, -1, 5)).toBe(4);
    expect(moveHighlight(4, 1, 5)).toBe(0);
    expect(moveHighlight(2, 1, 5)).toBe(3);
    expect(moveHighlight(0, 1, 0)).toBe(0);
  });

  it('shows a window of rows that keeps the highlighted one in view', () => {
    expect(visibleRows(30, 0, 10)).toEqual({ start: 0, end: 10 });
    expect(visibleRows(30, 15, 10)).toEqual({ start: 10, end: 20 });
    expect(visibleRows(30, 29, 10)).toEqual({ start: 20, end: 30 });
    expect(visibleRows(4, 3, 10)).toEqual({ start: 0, end: 4 });
  });
});
