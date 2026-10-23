import { RED } from '../model/defaults';
import type { MeasureHeader, Song } from '../model/song';
import { type TranscribedSong, buildSongFromTranscription } from '../transcription/build-song';
import type { TranscribedMeasure, TranscriptionPage } from '../transcription/types';
import type { PlannedSection, SongPlan } from './types';

/** What the user asked for that the song keeps in its information. */
export interface SongDetails {
  readonly genre: string;
  readonly description: string;
}

/** The composer field of a written song. */
export const SONG_WRITER_CREDIT = 'GP Editor Song Writer (Claude)';

/** The song's first bar states the plan's meter, key and tempo, whatever the first section's first measure says. */
function withOpening(first: TranscribedMeasure, plan: SongPlan): TranscribedMeasure {
  return { ...first, timeSignature: plan.timeSignature, keySignature: plan.keySignature, tempo: plan.tempo };
}

/** The sections' measures, the first one opening the song; their warnings are named after the section. */
function sectionPages(plan: SongPlan, sections: readonly TranscriptionPage[]): readonly TranscriptionPage[] {
  return sections.map((page, index) => {
    const measures = index === 0 && page.measures[0] !== undefined ? [withOpening(page.measures[0], plan), ...page.measures.slice(1)] : page.measures;
    return { measures };
  });
}

/** Index of the first bar of each section that has measures. */
function sectionStarts(sections: readonly TranscriptionPage[]): readonly (number | undefined)[] {
  return sections.map((page, index) =>
    page.measures.length === 0 ? undefined : sections.slice(0, index).reduce((bars, earlier) => bars + earlier.measures.length, 0),
  );
}

function withMarkers(headers: readonly MeasureHeader[], planned: readonly PlannedSection[], sections: readonly TranscriptionPage[]): readonly MeasureHeader[] {
  const starts = sectionStarts(sections);
  return headers.map((header, index) => {
    const section = planned[starts.indexOf(index)];
    return section === undefined ? header : { ...header, marker: { title: section.name, color: RED } };
  });
}

function sectionWarnings(planned: readonly PlannedSection[], sections: readonly TranscriptionPage[]): readonly string[] {
  return sections.flatMap((page, index) => (page.warnings ?? []).map((warning) => `${planned[index]?.name ?? `Section ${index + 1}`}: ${warning}`));
}

/**
 * The song a plan and its written sections make (section i written for plan.sections[i]): the plan's tracks, meter,
 * key and tempo, every section's measures in order with its name as a marker on its first bar, the syllables on the
 * lyrics track, and the title, genre (subtitle) and description (instructions) in the song's information. Throws a
 * TranscriptionError when no section has a measure.
 */
export function buildComposedSong(plan: SongPlan, sections: readonly TranscriptionPage[], details: SongDetails): TranscribedSong {
  const opening: TranscriptionPage = { song: { title: plan.title, tempo: plan.tempo, lyricsTrack: plan.lyricsTrack }, tracks: plan.tracks, measures: [] };
  const built = buildSongFromTranscription([opening, ...sectionPages(plan, sections)]);
  const song: Song = {
    ...built.song,
    info: { ...built.song.info, subtitle: details.genre.trim(), music: SONG_WRITER_CREDIT, instructions: details.description.trim() },
    measureHeaders: withMarkers(built.song.measureHeaders, plan.sections, sections),
  };
  return { song, warnings: [...plan.warnings, ...sectionWarnings(plan.sections, sections), ...built.warnings] };
}
