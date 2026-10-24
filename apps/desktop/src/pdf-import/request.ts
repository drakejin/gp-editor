// i18n-exempt-file: prompts and requests sent to Claude (never shown), and the models' product names
import { TRANSCRIPTION_TOOL, type TranscribedMeasure, type TranscriptionPage } from '@gp-editor/core';
import { plural } from '../lib/wording';

export interface TranscriptionModel {
  readonly id: string;
  readonly name: string;
}

/** Models offered for transcription: the strongest reader first (the default), then a faster, cheaper one. */
export const TRANSCRIPTION_MODELS: readonly TranscriptionModel[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
];

export const DEFAULT_TRANSCRIPTION_MODEL = 'claude-opus-5-5';

/** Room for a dense page of measures in one answer. */
const MAX_TOKENS = 32000;

export const TRANSCRIPTION_SYSTEM_PROMPT = `You transcribe guitar and bass sheet music from PDF pages into structured data by calling the record_transcription tool once per page.

Rules:
- Transcribe every measure on the page in reading order: systems top to bottom, measures left to right. Include measures that hold only rests. A multi-measure rest marked N becomes N measures, each a single whole-measure rest.
- One part per guitar or bass staff. A standard staff and the tab staff under it are the same part. When a staff has two voices (stems up and stems down), give each voice as its own part with the same track index, the upper voice first. Leave out vocal, lyric, drum and piano staves unless they are the only music; then transcribe the top one as a guitar part.
- With a tab staff, give each note's string (string 1 = the top tab line = the highest string) and fret. Without tab, give the written pitch as printed on the staff with the key signature and earlier accidentals in the measure applied, e.g. "F#4" (guitar and bass music is written an octave above how it sounds; give the written pitch).
- Take durations from the standard notation, or from the rhythm stems under the tab. All notes struck together form one beat (a chord). A rest is a beat with rest: true and no notes. Use dots and tuplet (3 = triplet) as printed.
- The durations of each part should fill its measure. Never invent notes to fill a gap; use rests.
- Give timeSignature, tempo (quarter-note BPM), keySignature (sharps > 0, flats < 0) only where printed or changed. Mark repeat signs (repeatOpen, repeatClose = times played) and voltas (alternateEnding).
- Tuning: as printed (e.g. "Drop D", "D A D G B E", or note names at the tab clef); otherwise standard (guitar E2 A2 D3 G3 B3 E4; bass E1 A1 D2 G2). List it lowest string first. Capo as printed, else 0.
- Effects only where clearly marked: H / P (hammer), sl. (slide), bend arrows (bend), ~ (vibrato), P.M. (palmMute), let ring (letRing), x noteheads (deadNote), (n) ghost notes (ghostNote), > (accent), harmonics (harmonic).
- Anything illegible, cut off or uncertain: transcribe your best reading and add a warning naming the measure (count measures from the top of the page).`;

export interface TranscriptionRequestInput {
  readonly model: string;
  /** The page, as a one-page PDF in base64. */
  readonly pdfBase64: string;
  /** 1-based. */
  readonly page: number;
  readonly pageCount: number;
  readonly title: string;
  /** The first page's transcription, for every later page. */
  readonly firstPage?: TranscriptionPage;
}

interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

interface DocumentBlock {
  readonly type: 'document';
  readonly source: { readonly type: 'base64'; readonly media_type: 'application/pdf'; readonly data: string };
}

export interface TranscriptionRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly tools: readonly (typeof TRANSCRIPTION_TOOL)[];
  readonly tool_choice: { readonly type: 'tool'; readonly name: string };
  readonly messages: readonly { readonly role: 'user'; readonly content: readonly [DocumentBlock, TextBlock] }[];
}

function lastSet<T>(measures: readonly TranscribedMeasure[], pick: (measure: TranscribedMeasure) => T | undefined): T | undefined {
  return measures.reduce<T | undefined>((found, measure) => pick(measure) ?? found, undefined);
}

function keyName(key: number): string {
  if (key === 0) {
    return 'no sharps or flats';
  }
  const count = Math.abs(key);
  return plural(count, key > 0 ? 'sharp' : 'flat');
}

/** What page 1 established, so a later page keeps the same tracks (and their indexes) and knows the current meter. */
function earlierPages(firstPage: TranscriptionPage): string {
  const tracks = (firstPage.tracks ?? []).map(
    (track, index) => `track ${index}: ${track.name} (${track.instrument}; ${track.tuning.join(' ')}; capo ${track.capo})`,
  );
  const time = lastSet(firstPage.measures, (measure) => measure.timeSignature);
  const tempo = lastSet(firstPage.measures, (measure) => measure.tempo) ?? firstPage.song?.tempo;
  const key = lastSet(firstPage.measures, (measure) => measure.keySignature);
  const facts = [
    tracks.length > 0 ? `Tracks found on page 1 — use the same indexes, and only add a track for a new instrument: ${tracks.join('; ')}.` : '',
    time === undefined ? '' : `Page 1 was in ${time.numerator}/${time.denominator}.`,
    tempo === undefined ? '' : `The tempo was ♩ = ${tempo}.`,
    key === undefined ? '' : `The key signature had ${keyName(key)}.`,
    'Only set timeSignature, tempo or keySignature on this page where it prints them.',
  ];
  return facts.filter((fact) => fact.length > 0).join(' ');
}

function pageInstructions(input: TranscriptionRequestInput): string {
  const where = `This is page ${input.page} of ${input.pageCount} of "${input.title}".`;
  if (input.firstPage === undefined) {
    return `${where} Also give the song and its tracks (name, guitar or bass, tuning, capo) as printed at the start. Transcribe every measure on this page.`;
  }
  return `${where} ${earlierPages(input.firstPage)} Transcribe every measure on this page.`;
}

/** The Messages API body for one page: the page as a PDF document, and the transcription tool the model must call. */
export function buildTranscriptionRequest(input: TranscriptionRequestInput): TranscriptionRequest {
  return {
    model: input.model,
    max_tokens: MAX_TOKENS,
    system: TRANSCRIPTION_SYSTEM_PROMPT,
    tools: [TRANSCRIPTION_TOOL],
    tool_choice: { type: 'tool', name: TRANSCRIPTION_TOOL.name },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } },
          { type: 'text', text: pageInstructions(input) },
        ],
      },
    ],
  };
}
