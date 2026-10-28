import { useCallback, useRef, useState } from 'react';
import type { Song } from '@gp-editor/core';
import { t } from '../lib/i18n/i18n';
import { sendMessages } from '../native/anthropic';
import type { SongIdea } from '../song-writer/request';
import { type SongWriterStep, writeSong } from '../song-writer/run-song-writer';

/** What the Song Writer panel holds while it is filled in; kept when the panel closes. */
export interface SongWriterDraft {
  readonly title: string;
  readonly genre: string;
  readonly lengthSeconds: number;
  readonly lyrics: string;
  readonly description: string;
  /** Build on the open score's notes, melody and rhythm. */
  readonly usesReference: boolean;
}

export const INITIAL_DRAFT: SongWriterDraft = { title: '', genre: '', lengthSeconds: 90, lyrics: '', description: '', usesReference: false };

export type SongWriterStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly step: SongWriterStep }
  | { readonly kind: 'failed'; readonly message: string };

export interface SongWriter {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly draft: SongWriterDraft;
  readonly changeDraft: (change: Partial<SongWriterDraft>) => void;
  readonly status: SongWriterStatus;
  /** Writes the draft's song with `model`; `reference` describes the open score when the draft builds on it. */
  readonly write: (model: string, reference: string | undefined) => void;
  readonly cancel: () => void;
}

const IDLE: SongWriterStatus = { kind: 'idle' };

/** "Planning the song…", "Writing Chorus, Verse 2… (3 of 8 sections done)". */
export function stepLabel(step: SongWriterStep): string {
  return step.kind === 'planning' ? t('tools.songWriter.planning') : t('tools.songWriter.writing', { sections: step.writing.join(', '), written: step.written, total: step.total });
}

/** The document name of a written song: its title, without the characters a file name cannot hold. */
export function songFileName(title: string): string {
  const name = title.trim().replace(/[/:]/g, '-');
  return name === '' ? t('tools.songWriter.newSong') : name;
}

/** The hint strip's line about a written song: what it is, and the first of any warnings. */
export function writtenSummary(song: Song, warnings: readonly string[]): string {
  const bars = t('common.bars', { count: song.measureHeaders.length });
  const what = t('tools.songWriter.summary', { title: song.info.title || t('tools.songWriter.newSong'), bars, tracks: t('common.tracks', { count: song.tracks.length }) });
  const first = warnings[0];
  return first === undefined ? `${what}.` : `${what}. ${t('tools.songWriter.warnings', { count: warnings.length })}: ${first}${warnings.length > 1 ? ' …' : ''}`;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Edit ▸ AI Wizard ▸ Song Writer…: the panel's draft and a run of writeSong. A written song goes to `onWritten` (to open
 * it) and the panel closes; a failure stays in the panel.
 */
export function useSongWriter(onWritten: (song: Song, fileName: string, warnings: readonly string[]) => void): SongWriter {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<SongWriterDraft>(INITIAL_DRAFT);
  const [status, setStatus] = useState<SongWriterStatus>(IDLE);
  const isCancelled = useRef(false);
  const isRunning = status.kind === 'running';

  const write = useCallback(
    (model: string, reference: string | undefined) => {
      if (isRunning) {
        return;
      }
      isCancelled.current = false;
      const idea: SongIdea = { ...draft, reference: draft.usesReference ? reference : undefined };
      const deps = { send: sendMessages, wait, isCancelled: () => isCancelled.current };
      setStatus({ kind: 'running', step: { kind: 'planning' } });
      void writeSong(idea, model, deps, (step) => setStatus({ kind: 'running', step })).then((result) => {
        if (!result.isOk) {
          setStatus({ kind: 'failed', message: result.message });
          return;
        }
        setStatus(IDLE);
        setIsOpen(false);
        onWritten(result.song, songFileName(result.song.info.title || draft.title), result.warnings);
      });
    },
    [draft, isRunning, onWritten],
  );

  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    draft,
    changeDraft: useCallback((change: Partial<SongWriterDraft>) => setDraft((current) => ({ ...current, ...change })), []),
    status,
    write,
    cancel: useCallback(() => {
      isCancelled.current = true;
    }, []),
  };
}
