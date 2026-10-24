import { t } from '../lib/i18n/i18n';
import type { ImportProject } from './project-file';

const THOUSAND = 1000;

function pageCount(project: ImportProject): string {
  return t('window.pdfStatus.pagesOf', { done: project.pagesDone.length, count: project.pageCount });
}

function tokens(project: ImportProject): string {
  const total = project.usage.inputTokens + project.usage.outputTokens;
  return total < THOUSAND ? t('window.pdfStatus.tokens', { count: total }) : t('window.pdfStatus.kiloTokens', { count: (total / THOUSAND).toFixed(1) });
}

/** One line for a project in the project list. */
export function projectStatusText(project: ImportProject): string {
  switch (project.status) {
    case 'transcribing':
      return t('window.pdfStatus.transcribing', { pages: pageCount(project) });
    case 'done':
      return t('window.pdfStatus.done', { count: project.pageCount });
    case 'partial':
      return t('window.pdfStatus.partial', { pages: pageCount(project) });
    case 'failed':
      return t('window.pdfStatus.failed', { error: project.error ?? t('window.pdfStatus.unknownError') });
    case 'cancelled':
      return t('window.pdfStatus.cancelled', { pages: pageCount(project) });
  }
}

/** The banner line while an import runs. */
export function importProgressText(project: ImportProject, modelName: string): string {
  return t('window.pdfStatus.importing', { name: project.name, model: modelName, pages: pageCount(project), tokens: tokens(project) });
}
