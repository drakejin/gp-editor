import type { ImportProject } from './project-file';

const THOUSAND = 1000;

function pageCount(project: ImportProject): string {
  return `${project.pagesDone.length} of ${project.pageCount} pages`;
}

function tokens(project: ImportProject): string {
  const total = project.usage.inputTokens + project.usage.outputTokens;
  return total < THOUSAND ? `${total} tokens` : `${(total / THOUSAND).toFixed(1)}k tokens`;
}

/** One line for a project in the project list. */
export function projectStatusText(project: ImportProject): string {
  switch (project.status) {
    case 'transcribing':
      return `Transcribing · ${pageCount(project)}`;
    case 'done':
      return `Done · ${project.pageCount} pages`;
    case 'partial':
      return `${pageCount(project)} · resume for the rest`;
    case 'failed':
      return `Stopped: ${project.error ?? 'unknown error'}`;
    case 'cancelled':
      return `Cancelled · ${pageCount(project)}`;
  }
}

/** The banner line while an import runs. */
export function importProgressText(project: ImportProject, modelName: string): string {
  return `Importing “${project.name}” with ${modelName} — ${pageCount(project)} · ${tokens(project)}`;
}
