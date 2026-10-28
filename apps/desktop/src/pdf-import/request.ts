// i18n-exempt-file: prompts and requests sent to Claude (never shown), and the models' product names
import { TRANSCRIPTION_TOOL, type TranscribedMeasure, type TranscribedTrack, type TranscriptionPage } from '@gp-editor/core';
import { STREAMED_ANSWER, type StreamedAnswerFields, type StreamedTool, streamedTool } from '../lib/streamed-request';
import { plural } from '../lib/wording';
import { drumStaffGuide } from './drum-staff-guide';

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

/**
 * Room for a dense full-band page and the thinking before it (Claude Opus 5.5 always thinks, and thinking counts toward
 * max_tokens). Measured: the 12 densest bars of a band score (vocals, two guitars, keys, bass, drums: 460 beats) are
 * 33,000 characters of tool input, about 11,000–13,000 tokens; 8 bars are 20,000–24,000 characters. Both models take
 * up to 128,000. The answer is streamed (lib/streamed-request.ts), so a page the model is still writing keeps the
 * connection busy until it is done.
 */
const MAX_TOKENS = 64000;

export const TRANSCRIPTION_SYSTEM_PROMPT = `You transcribe sheet music from PDF pages into structured data: every staff on the page — guitars, bass, drums, vocals, keyboards and any other instrument. Answer every page by calling the record_transcription tool once with the whole page; never answer in text.

Rules:
- Transcribe every measure on the page in reading order: systems top to bottom, measures left to right. Include measures that hold only rests. A multi-measure rest marked N becomes N measures, each a single whole-measure rest.
- Transcribe every staff of a system, top to bottom, each as a track, in that order: one part per track in each measure where it plays. Leave no staff out. Chord symbols, chord diagrams and lyrics are not staves (lyrics go with the vocal staff they are under).
- A standard staff and the tab staff under it are one part of one track. When a staff has two voices (stems up and stems down), give each voice as its own part with the same track index, the upper voice first.
- Each track's instrument: guitar, bass, ukulele or banjo for a fretted instrument's staff (with or without tab); drums for a drum staff (a percussion clef, or a staff the score names Drums or Percussion); vocals for a sung melody (a staff with lyrics under it, or named Vocals, Voice, Soprano …); keys for a piano, organ, electric piano or synth keyboard; other for any other instrument (strings, winds, brass, lead synth …), with its General MIDI program. Name each track as the score names its staff. A piano or keyboard grand staff (two staves joined by a brace) is two keys tracks, the upper staff then the lower one, named like "Piano (right hand)" and "Piano (left hand)".
- Guitar, bass, ukulele and banjo: with a tab staff, give each note's string (string 1 = the top tab line = the highest string) and fret; banjo tab writes the short 5th string's frets from the main nut (0, 6, 7 …): give them as written. Without tab, give the written pitch as printed on the staff with the key signature and earlier accidentals in the measure applied, e.g. "F#4" (guitar and bass music is written an octave above how it sounds; give the written pitch). Tuning: as printed (e.g. "Drop D", "D A D G B E", or note names at the tab clef); otherwise standard (guitar E2 A2 D3 G3 B3 E4; bass E1 A1 D2 G2; ukulele G4 C4 E4 A4; banjo G4 D3 G3 B3 D4). List it from the bottom tab line up (lowest string first). Capo as printed, else 0.
- Vocals, keys and other: give each note's written pitch with the key signature and accidentals applied, and the staff's clef (treble or bass). For a clef with a small 8 below it (a tenor voice) or a transposing instrument (B♭ trumpet or clarinet, E♭ alto sax, horn in F), give the pitch it sounds. Give a keys or other track's General MIDI program (0-based: 0 piano, 4 electric piano, 16 organ, 40 violin, 42 cello, 48 strings, 56 trumpet, 65 alto sax, 73 flute, 81 lead synth …); vocals need none. Set song.lyricsTrack to the vocal track the lyrics are sung on, and give each measure's syllables in its lyrics.
- Drums: one drums track for a drum staff. Each note names its drum with "drum", a General MIDI percussion name from the tool's list, never a pitch, string or fret. A drum legend or key printed on the page wins; otherwise read the standard drum staff (place, notehead: drum):
${drumStaffGuide().join('\n')}
  An x with a small "o" above is an open hi-hat. Stems up (hands) and stems down (feet) are two parts of the drums track, the upper first. Mark accents (>) and ghost notes (a notehead in parentheses) as effects; for a flam or drag give the main stroke.
- Take durations from the standard notation, or from the rhythm stems under the tab. All notes struck together form one beat (a chord). A rest is a beat with rest: true and no notes. Use dots and tuplet (3 = triplet) as printed.
- The durations of each part should fill its measure. Never invent notes to fill a gap; use rests.
- Give timeSignature, tempo (quarter-note BPM), keySignature (sharps > 0, flats < 0) only where printed or changed. Mark repeat signs (repeatOpen, repeatClose = times played) and voltas (alternateEnding).
- Effects only where clearly marked: H / P (hammer), sl. (slide), bend arrows (bend), ~ (vibrato), P.M. (palmMute), let ring (letRing), x noteheads on a pitched staff (deadNote), (n) ghost notes (ghostNote), > (accent), harmonics (harmonic).
- Anything illegible, cut off or uncertain: transcribe your best reading and add a warning naming the measure (count measures from the top of the page).
- A page with no music on it (a cover, lyrics or notes only): call the tool with no measures and a warning saying so.`;

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

export interface TranscriptionRequest extends StreamedAnswerFields {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly tools: readonly StreamedTool<typeof TRANSCRIPTION_TOOL>[];
  /** Not forced: Claude Opus 5.5 and Sonnet 5.5 refuse a forced tool_choice with a 400; the prompt names the tool. */
  readonly tool_choice: { readonly type: 'auto' };
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

/** "Guitar (guitar; D2 A2 D3 G3 B3 E4; capo 2)", "Piano (left hand) (keys; bass clef)", "Violin (other; program 40)". */
function trackFacts(track: TranscribedTrack): string {
  const hasTuning = track.tuning.length > 0;
  const facts = [
    track.instrument,
    ...(hasTuning ? [track.tuning.join(' ')] : []),
    ...(hasTuning || track.capo > 0 ? [`capo ${track.capo}`] : []),
    ...(track.clef === undefined ? [] : [`${track.clef} clef`]),
    ...(track.program === undefined ? [] : [`program ${track.program}`]),
  ];
  return `${track.name} (${facts.join('; ')})`;
}

/** The track page 1 sings the lyrics on: the one it named, else its first vocal track. */
function lyricsFact(firstPage: TranscriptionPage): string {
  const tracks = firstPage.tracks ?? [];
  const named = firstPage.song?.lyricsTrack;
  const index = named ?? tracks.findIndex((track) => track.instrument === 'vocals');
  const track = tracks[index];
  return track === undefined ? '' : `The lyrics are sung on track ${index} (${track.name}).`;
}

/** What page 1 established, so a later page keeps the same tracks (and their indexes) and knows the current meter. */
function earlierPages(firstPage: TranscriptionPage): string {
  const tracks = (firstPage.tracks ?? []).map((track, index) => `track ${index}: ${trackFacts(track)}`);
  const time = lastSet(firstPage.measures, (measure) => measure.timeSignature);
  const tempo = lastSet(firstPage.measures, (measure) => measure.tempo) ?? firstPage.song?.tempo;
  const key = lastSet(firstPage.measures, (measure) => measure.keySignature);
  const facts = [
    tracks.length > 0 ? `Tracks found on page 1, top to bottom — use the same indexes, and only add a track (after them) for a staff page 1 does not have: ${tracks.join('; ')}.` : '',
    lyricsFact(firstPage),
    time === undefined ? '' : `Page 1 was in ${time.numerator}/${time.denominator}.`,
    tempo === undefined ? '' : `The tempo was ♩ = ${tempo}.`,
    key === undefined ? '' : `The key signature had ${keyName(key)}.`,
    'Only set timeSignature, tempo or keySignature on this page where it prints them.',
  ];
  return facts.filter((fact) => fact.length > 0).join(' ');
}

const CALL_TOOL = `Call ${TRANSCRIPTION_TOOL.name} with every measure on this page.`;

function pageInstructions(input: TranscriptionRequestInput): string {
  const where = `This is page ${input.page} of ${input.pageCount} of "${input.title}".`;
  if (input.firstPage === undefined) {
    return `${where} Also give the song and its tracks, one for every staff top to bottom (name, instrument; a fretted instrument's tuning and capo, another's clef and program), as printed at the start. ${CALL_TOOL}`;
  }
  return `${where} ${earlierPages(input.firstPage)} ${CALL_TOOL}`;
}

/** The Messages API body for one page: the page as a PDF document, and the transcription tool the model is asked to call; the answer streamed. */
export function buildTranscriptionRequest(input: TranscriptionRequestInput): TranscriptionRequest {
  return {
    model: input.model,
    max_tokens: MAX_TOKENS,
    ...STREAMED_ANSWER,
    system: TRANSCRIPTION_SYSTEM_PROMPT,
    tools: [streamedTool(TRANSCRIPTION_TOOL)],
    tool_choice: { type: 'auto' },
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
