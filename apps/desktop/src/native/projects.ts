import { NativeModules } from 'react-native';

/** A PDF picked for import. */
export interface PdfChoice {
  readonly path: string;
  readonly name: string;
}

/** A new project folder in ~/Documents/GP Editor Projects with a copy of the PDF. */
export interface CreatedProject {
  readonly path: string;
  readonly name: string;
  /** File name of the PDF copy inside the project. */
  readonly sourceFile: string;
  readonly pageCount: number;
}

/** A project folder as listed: its project.json text (null when missing) and last change (ms since 1970). */
export interface ProjectEntry {
  readonly path: string;
  readonly name: string;
  readonly modified: number;
  readonly project: string | null;
}

interface GPProjectsModule {
  choosePdf(): Promise<PdfChoice | null>;
  createProject(pdfPath: string): Promise<CreatedProject>;
  pdfPages(projectPath: string, file: string, first: number, last: number): Promise<string>;
  writeText(projectPath: string, file: string, text: string): Promise<string>;
  writeBase64(projectPath: string, file: string, base64: string): Promise<string>;
  readText(projectPath: string, file: string): Promise<string | null>;
  listProjects(): Promise<readonly ProjectEntry[]>;
  revealProject(projectPath: string): Promise<void>;
}

/** JS side of macos/GPEditor-macOS/GPProjects.m. Paths outside a project are refused there. */
const native = NativeModules.GPProjects as GPProjectsModule | undefined;

function requireNative(): GPProjectsModule {
  if (native === undefined) {
    throw new Error('GPProjects native module is not available on this platform');
  }
  return native;
}

/** Open panel for a PDF; null when cancelled. */
export function choosePdf(): Promise<PdfChoice | null> {
  return requireNative().choosePdf();
}

export function createProject(pdfPath: string): Promise<CreatedProject> {
  return requireNative().createProject(pdfPath);
}

/** Pages first…last (1-based, inclusive) of the project's PDF, as a PDF in base64. */
export function pdfPages(projectPath: string, file: string, first: number, last: number): Promise<string> {
  return requireNative().pdfPages(projectPath, file, first, last);
}

/** Writes a text file inside the project (folders created); resolves its full path. */
export function writeProjectText(projectPath: string, file: string, text: string): Promise<string> {
  return requireNative().writeText(projectPath, file, text);
}

export function writeProjectBase64(projectPath: string, file: string, base64: string): Promise<string> {
  return requireNative().writeBase64(projectPath, file, base64);
}

/** A text file of the project; null when it does not exist. */
export function readProjectText(projectPath: string, file: string): Promise<string | null> {
  return requireNative().readText(projectPath, file);
}

/** Every project, newest first; none where the native module is missing (tests). */
export function listProjects(): Promise<readonly ProjectEntry[]> {
  return native === undefined ? Promise.resolve([]) : native.listProjects();
}

export function revealProject(projectPath: string): Promise<void> {
  return requireNative().revealProject(projectPath);
}
