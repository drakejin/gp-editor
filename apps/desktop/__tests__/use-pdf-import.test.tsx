import ReactTestRenderer from 'react-test-renderer';
import { type PdfImport, usePdfImport } from '../src/hooks/use-pdf-import';
import type { ApiResponse } from '../src/native/anthropic';
import type { CreatedProject, PdfChoice, ProjectEntry } from '../src/native/projects';
import { type ImportProject, PROJECT_FILE, newImportProject, parseImportProject, serializeImportProject } from '../src/pdf-import/project-file';
import { DEFAULT_TRANSCRIPTION_MODEL } from '../src/pdf-import/request';

const mockAnthropic = {
  hasApiKey: jest.fn<Promise<boolean>, []>(),
  setApiKey: jest.fn<Promise<void>, [string]>(),
  clearApiKey: jest.fn<Promise<void>, []>(),
  savedModel: jest.fn<Promise<string | null>, []>(),
  saveModel: jest.fn<Promise<void>, [string]>(),
  send: jest.fn<Promise<ApiResponse>, [string]>(),
};

jest.mock('../src/native/anthropic', () => ({
  hasApiKey: () => mockAnthropic.hasApiKey(),
  setApiKey: (key: string) => mockAnthropic.setApiKey(key),
  clearApiKey: () => mockAnthropic.clearApiKey(),
  savedModel: () => mockAnthropic.savedModel(),
  saveModel: (model: string) => mockAnthropic.saveModel(model),
  sendMessages: (body: string) => mockAnthropic.send(body),
}));

/** The project folders on disk, by full path (`<project>/<file>`). */
const mockDisk = new Map<string, string>();

const mockProjects = {
  choosePdf: jest.fn<Promise<PdfChoice | null>, []>(),
  createProject: jest.fn<Promise<CreatedProject>, [string]>(),
  listProjects: jest.fn<Promise<readonly ProjectEntry[]>, []>(),
  revealProject: jest.fn<Promise<void>, [string]>(),
  writeText: jest.fn(async (projectPath: string, file: string, text: string) => {
    mockDisk.set(`${projectPath}/${file}`, text);
    return `${projectPath}/${file}`;
  }),
  writeBase64: jest.fn(async (projectPath: string, file: string, base64: string) => {
    mockDisk.set(`${projectPath}/${file}`, base64);
    return `${projectPath}/${file}`;
  }),
  readText: jest.fn(async (projectPath: string, file: string) => mockDisk.get(`${projectPath}/${file}`) ?? null),
};

jest.mock('../src/native/projects', () => ({
  choosePdf: () => mockProjects.choosePdf(),
  createProject: (pdfPath: string) => mockProjects.createProject(pdfPath),
  listProjects: () => mockProjects.listProjects(),
  revealProject: (projectPath: string) => mockProjects.revealProject(projectPath),
  pdfPages: async (_projectPath: string, _file: string, first: number) => `pdf-page-${first}`,
  writeProjectText: (projectPath: string, file: string, text: string) => mockProjects.writeText(projectPath, file, text),
  writeProjectBase64: (projectPath: string, file: string, base64: string) => mockProjects.writeBase64(projectPath, file, base64),
  readProjectText: (projectPath: string, file: string) => mockProjects.readText(projectPath, file),
}));

const QUARTER_BAR = {
  parts: [{ track: 0, beats: [1, 2, 3, 4].map((fret) => ({ duration: 'quarter', notes: [{ string: 1, fret }] })) }],
};
const FIRST_PAGE = {
  song: { title: 'Etude', artist: 'Anon', tempo: 90 },
  tracks: [{ name: 'Guitar', instrument: 'guitar', tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 0 }],
  measures: [{ timeSignature: { numerator: 4, denominator: 4 }, ...QUARTER_BAR }],
};
const LATER_PAGE = { measures: [QUARTER_BAR] };

/** A Messages API answer carrying one page's transcription. */
function answer(input: unknown): ApiResponse {
  return {
    status: 200,
    body: JSON.stringify({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', name: 'record_transcription', input }],
      usage: { input_tokens: 1000, output_tokens: 200 },
    }),
  };
}

/** Answers every page; page 1 names the song and its track. */
function answerEveryPage(body: string): Promise<ApiResponse> {
  return Promise.resolve(answer(body.includes('pdf-page-1"') ? FIRST_PAGE : LATER_PAGE));
}

const PDF: PdfChoice = { path: '/Users/me/Downloads/Etude.pdf', name: 'Etude.pdf' };
const PROJECT_PATH = '/Users/me/Documents/GP Editor Projects/Etude';

function createdProject(pageCount: number): CreatedProject {
  return { path: PROJECT_PATH, name: 'Etude', sourceFile: 'Etude.pdf', pageCount };
}

function savedProject(): ImportProject | undefined {
  return parseImportProject(mockDisk.get(`${PROJECT_PATH}/${PROJECT_FILE}`) ?? null);
}

interface HookProbe {
  readonly current: () => PdfImport;
  readonly onSongReady: jest.Mock<void, [string]>;
  readonly onNeedsKey: jest.Mock<void, []>;
}

async function renderHook(): Promise<HookProbe> {
  const onSongReady = jest.fn<void, [string]>();
  const onNeedsKey = jest.fn<void, []>();
  let latest: PdfImport | undefined;
  function Probe() {
    latest = usePdfImport(onSongReady, onNeedsKey);
    return null;
  }
  await settle(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return { current: () => latest!, onSongReady, onNeedsKey };
}

/** Runs `action`, then lets every pending native call and state update settle. */
async function settle(action: () => void): Promise<void> {
  await ReactTestRenderer.act(async () => {
    action();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDisk.clear();
  mockAnthropic.hasApiKey.mockResolvedValue(true);
  mockAnthropic.savedModel.mockResolvedValue(null);
  mockAnthropic.send.mockImplementation(answerEveryPage);
  mockProjects.listProjects.mockResolvedValue([]);
  mockProjects.choosePdf.mockResolvedValue(PDF);
  mockProjects.createProject.mockResolvedValue(createdProject(2));
});

describe('usePdfImport start', () => {
  it('asks for a key and picks no PDF when no API key is set', async () => {
    // Arrange
    mockAnthropic.hasApiKey.mockResolvedValue(false);
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(hook.onNeedsKey).toHaveBeenCalledTimes(1);
    expect(mockProjects.choosePdf).not.toHaveBeenCalled();
    expect(mockProjects.createProject).not.toHaveBeenCalled();
    expect(hook.current().hasKey).toBe(false);
  });

  it('makes a project for the picked PDF, writes its project.json and transcribes it into a song it opens', async () => {
    // Arrange
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(mockProjects.createProject).toHaveBeenCalledWith(PDF.path);
    const [projectPath, file, firstWrite] = mockProjects.writeText.mock.calls[0] ?? [];
    expect([projectPath, file]).toEqual([PROJECT_PATH, PROJECT_FILE]);
    expect(parseImportProject(firstWrite ?? null)).toEqual({
      ...newImportProject(createdProject(2), DEFAULT_TRANSCRIPTION_MODEL, new Date(0)),
      createdAt: expect.any(String),
    });
    expect(mockAnthropic.send).toHaveBeenCalledTimes(2);
    expect(mockDisk.has(`${PROJECT_PATH}/Etude.gp5`)).toBe(true);
    expect(savedProject()).toMatchObject({ status: 'done', pagesDone: [1, 2], songFile: 'Etude.gp5' });
    expect(hook.onSongReady).toHaveBeenCalledWith(`${PROJECT_PATH}/Etude.gp5`);
    expect(hook.current()).toMatchObject({ isRunning: false, error: undefined, current: { path: PROJECT_PATH, project: { status: 'done' } } });
  });

  it('does nothing when the PDF open panel is cancelled', async () => {
    mockProjects.choosePdf.mockResolvedValueOnce(null);
    const hook = await renderHook();
    await settle(() => hook.current().start());
    expect(mockProjects.createProject).not.toHaveBeenCalled();
    expect(hook.current()).toMatchObject({ isRunning: false, current: undefined, error: undefined });
  });

  it('shows why an import could not start when its project cannot be made', async () => {
    // Arrange
    mockProjects.createProject.mockRejectedValueOnce(new Error('The PDF has no pages'));
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(hook.current().error).toBe('The PDF has no pages');
    expect(mockAnthropic.send).not.toHaveBeenCalled();
    expect(hook.onSongReady).not.toHaveBeenCalled();
  });

  it('shows the error and stops running when a project file cannot be written mid-import', async () => {
    // Arrange: the first project.json is written, the next write fails
    mockProjects.writeText.mockResolvedValueOnce(`${PROJECT_PATH}/${PROJECT_FILE}`).mockRejectedValueOnce(new Error('The disk is full'));
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(hook.current()).toMatchObject({ isRunning: false, error: 'The disk is full' });
    expect(hook.onSongReady).not.toHaveBeenCalled();
    expect(mockProjects.listProjects).toHaveBeenCalledTimes(2);
  });

  it('imports a PDF the system handed over without showing the open panel', async () => {
    // Arrange
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().importPath('/Users/me/Desktop/Etude.pdf'));

    // Assert
    expect(mockProjects.choosePdf).not.toHaveBeenCalled();
    expect(mockProjects.createProject).toHaveBeenCalledWith('/Users/me/Desktop/Etude.pdf');
    expect(hook.onSongReady).toHaveBeenCalledWith(`${PROJECT_PATH}/Etude.gp5`);
  });

  it('transcribes new imports with the model saved earlier', async () => {
    // Arrange
    mockAnthropic.savedModel.mockResolvedValue('claude-sonnet-5');
    mockProjects.createProject.mockResolvedValueOnce(createdProject(1));
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().start());

    // Assert
    expect(hook.current().model).toBe('claude-sonnet-5');
    expect(savedProject()?.model).toBe('claude-sonnet-5');
    expect(JSON.parse(mockAnthropic.send.mock.calls[0]?.[0] ?? '{}')).toMatchObject({ model: 'claude-sonnet-5' });
  });
});

describe('usePdfImport cancel', () => {
  it('stops after the page in progress when cancelled, marks the import cancelled and opens no song', async () => {
    // Arrange: page 1 of 2 is still with the model
    const firstPage = deferred<ApiResponse>();
    mockAnthropic.send.mockReturnValueOnce(firstPage.promise);
    const hook = await renderHook();
    await settle(() => hook.current().start());
    expect(hook.current().isRunning).toBe(true);

    // Act
    await settle(() => hook.current().cancel());
    await settle(() => firstPage.resolve(answer(FIRST_PAGE)));

    // Assert
    expect(mockAnthropic.send).toHaveBeenCalledTimes(1);
    expect(hook.current()).toMatchObject({ isRunning: false, current: { project: { status: 'cancelled', pagesDone: [1] } } });
    expect(savedProject()?.status).toBe('cancelled');
    expect(mockProjects.writeBase64).not.toHaveBeenCalled();
    expect(hook.onSongReady).not.toHaveBeenCalled();
  });
});

describe('usePdfImport while an import runs', () => {
  it('refuses a second import and keeps the running one going', async () => {
    // Arrange: page 1 of the first import is still with the model
    const firstPage = deferred<ApiResponse>();
    mockAnthropic.send.mockReturnValueOnce(firstPage.promise);
    const hook = await renderHook();
    await settle(() => hook.current().start());

    // Act
    await settle(() => hook.current().importPath('/Users/me/Downloads/Other.pdf'));
    await settle(() => hook.current().resume(PROJECT_PATH));

    // Assert
    expect(mockProjects.createProject).toHaveBeenCalledTimes(1);
    expect(mockAnthropic.send).toHaveBeenCalledTimes(1);
    expect(hook.current()).toMatchObject({ isRunning: true, error: 'An import is already running; cancel it or wait for it to finish' });

    await settle(() => firstPage.resolve(answer(FIRST_PAGE)));
    await settle(() => undefined);
    expect(hook.onSongReady).toHaveBeenCalledTimes(1);
  });
});

describe('usePdfImport resume', () => {
  it.each([
    ['has no project.json', undefined],
    ['has a project.json that is not JSON', '{ "version": 1, '],
    ['has a project.json of another shape', '{ "version": 2 }'],
  ])('shows “This folder has no readable project.json” when the folder %s', async (_case, projectJson) => {
    // Arrange
    if (projectJson !== undefined) {
      mockDisk.set(`${PROJECT_PATH}/${PROJECT_FILE}`, projectJson);
    }
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().resume(PROJECT_PATH));

    // Assert
    expect(hook.current().error).toBe('This folder has no readable project.json');
    expect(mockAnthropic.send).not.toHaveBeenCalled();
  });

  it('shows the same error when project.json cannot be read at all', async () => {
    mockProjects.readText.mockRejectedValueOnce(new Error('Permission denied'));
    const hook = await renderHook();
    await settle(() => hook.current().resume(PROJECT_PATH));
    expect(hook.current().error).toBe('This folder has no readable project.json');
  });

  it('transcribes only the pages still missing, with the model chosen now, and opens the song', async () => {
    // Arrange: page 1 was saved by an earlier run with another model
    const earlier = { ...newImportProject(createdProject(2), 'claude-old', new Date(0)), status: 'cancelled' as const, pagesDone: [1] };
    mockDisk.set(`${PROJECT_PATH}/${PROJECT_FILE}`, serializeImportProject(earlier));
    mockDisk.set(`${PROJECT_PATH}/pages/page-001.json`, JSON.stringify(FIRST_PAGE));
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().resume(PROJECT_PATH));

    // Assert
    expect(mockAnthropic.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockAnthropic.send.mock.calls[0]?.[0] ?? '{}')).toMatchObject({ model: DEFAULT_TRANSCRIPTION_MODEL });
    expect(savedProject()).toMatchObject({ status: 'done', pagesDone: [1, 2], model: DEFAULT_TRANSCRIPTION_MODEL });
    expect(hook.onSongReady).toHaveBeenCalledWith(`${PROJECT_PATH}/Etude.gp5`);
  });

  it('asks for a key instead of resuming when none is set', async () => {
    mockAnthropic.hasApiKey.mockResolvedValue(false);
    const hook = await renderHook();
    await settle(() => hook.current().resume(PROJECT_PATH));
    expect(hook.onNeedsKey).toHaveBeenCalledTimes(1);
    expect(mockProjects.readText).not.toHaveBeenCalled();
  });
});

describe('usePdfImport key, model and projects', () => {
  it('knows whether a key is set once the native side answers', async () => {
    const hook = await renderHook();
    expect(hook.current().hasKey).toBe(true);
  });

  it('saves a key and remembers that one is set', async () => {
    // Arrange
    mockAnthropic.hasApiKey.mockResolvedValue(false);
    mockAnthropic.setApiKey.mockResolvedValueOnce(undefined);
    const hook = await renderHook();

    // Act
    await ReactTestRenderer.act(() => hook.current().saveKey('sk-ant-test'));

    // Assert
    expect(mockAnthropic.setApiKey).toHaveBeenCalledWith('sk-ant-test');
    expect(hook.current().hasKey).toBe(true);
  });

  it('removes the API key', async () => {
    // Arrange
    mockAnthropic.clearApiKey.mockResolvedValueOnce(undefined);
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().removeKey());

    // Assert
    expect(mockAnthropic.clearApiKey).toHaveBeenCalledTimes(1);
    expect(hook.current().hasKey).toBe(false);
  });

  it('shows why the key could not be removed and keeps it', async () => {
    mockAnthropic.clearApiKey.mockRejectedValueOnce(new Error('Keychain locked'));
    const hook = await renderHook();
    await settle(() => hook.current().removeKey());
    expect(hook.current()).toMatchObject({ hasKey: true, error: 'Keychain locked' });
  });

  it('remembers a newly chosen model', async () => {
    mockAnthropic.saveModel.mockResolvedValueOnce(undefined);
    const hook = await renderHook();
    await settle(() => hook.current().chooseModel('claude-sonnet-5'));
    expect(hook.current().model).toBe('claude-sonnet-5');
    expect(mockAnthropic.saveModel).toHaveBeenCalledWith('claude-sonnet-5');
  });

  it('lists the project folders with what their project.json says', async () => {
    // Arrange
    const project = newImportProject(createdProject(2), DEFAULT_TRANSCRIPTION_MODEL, new Date(0));
    mockProjects.listProjects.mockResolvedValue([
      { path: PROJECT_PATH, name: 'Etude', modified: 1, project: serializeImportProject(project) },
      { path: '/p/Handmade', name: 'Handmade', modified: 2, project: null },
    ]);

    // Act
    const hook = await renderHook();

    // Assert
    expect(hook.current().projects).toEqual([
      { path: PROJECT_PATH, name: 'Etude', modified: 1, project },
      { path: '/p/Handmade', name: 'Handmade', modified: 2, project: undefined },
    ]);
  });

  it('shows why the project folders could not be listed', async () => {
    mockProjects.listProjects.mockRejectedValue(new Error('No access to Documents'));
    const hook = await renderHook();
    expect(hook.current()).toMatchObject({ projects: [], error: 'No access to Documents' });
  });

  it('shows why a folder could not be revealed, until dismissed', async () => {
    // Arrange
    mockProjects.revealProject.mockRejectedValueOnce(new Error('Folder not found'));
    const hook = await renderHook();

    // Act
    await settle(() => hook.current().reveal(PROJECT_PATH));
    const shown = hook.current().error;
    await settle(() => hook.current().dismiss());

    // Assert
    expect(mockProjects.revealProject).toHaveBeenCalledWith(PROJECT_PATH);
    expect(shown).toBe('Folder not found');
    expect(hook.current().error).toBeUndefined();
  });
});
