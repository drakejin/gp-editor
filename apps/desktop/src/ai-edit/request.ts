// i18n-exempt-file: the prompts and requests sent to Claude, in English whatever the app's language
import { type ComposeScope, MAX_COMPOSED_BARS, type Song, WRITE_BARS_TOOL } from '@gp-editor/core';
import { describeInstruments } from '../compose/instruments-text';
import { type ComposeRequest, WRITE_BARS_MAX_TOKENS, quotedPrompt, scoreHeading } from '../compose/request';
import { type ScoreText, describeScore } from '../compose/score-text';
import { STREAMED_ANSWER, streamedTool } from '../lib/streamed-request';
import type { BarChunk } from './chunks';

/** What Claude is asked: the user's instruction, or easier fingerings for the notes as they are. */
export type AiEditMode = { readonly kind: 'instruction'; readonly prompt: string } | { readonly kind: 'fingering' };

/** One request of an AI Edit run: the bars it rewrites, the tracks it may write, and which part of the run it is. */
export interface AiEditPart {
  readonly mode: AiEditMode;
  readonly chunk: BarChunk;
  readonly trackIndexes: readonly number[];
  /** 0-based, of `count` parts. */
  readonly index: number;
  readonly count: number;
}

const SHARED_RULES = `- Guitar, bass, ukulele and banjo: every note as string and fret (string 1 = the highest string; frets counted from the capo; fingerings a player can play), never as a pitch.
- Drums: every note names its drum ("drum", a General MIDI percussion name from the tool's list), never a pitch, string or fret.
- Vocals, keys and other instruments: every note as its sounding pitch, e.g. "C#4".
- In each bar, each part's beats fill the bar exactly (rests where the instrument is silent). A track may have two parts in a bar for two voices, the upper voice first.
- The bars keep their meter, tempo and key: never set timeSignature, tempo or keySignature on a bar the score has.`;

export const AI_EDIT_SYSTEM_PROMPT = `You are an arranger and guitar teacher working inside a Guitar Pro editor. You rewrite bars of an existing score as the user asks, by calling the write_bars tool once with all of them; never answer in text.

Rules:
- Read the whole score first: its key, harmony, rhythm and groove, sections, register, and each instrument's role and idiom. Change what the request asks for and keep everything else as it is — the same notes, rhythm and effects where the request does not touch them, the same style and feel — joining smoothly to the bars before and after.
- Rewrite exactly the bars you are given, in the tracks you may write: a track you give a part in any bar is rewritten over all of those bars, so give it a part in every bar where it plays (a bar without its part becomes rests). Tracks you give no part keep what they have.
${SHARED_RULES}
- Effects (hammer, slide, bend, vibrato, palmMute, letRing, deadNote, ghostNote, accent, harmonic): keep the score's where its notes stay; dots and tuplets (3 = triplet) where the rhythm needs them.
- No new tracks. When the request cannot be done as asked, do the closest you can and say what in warnings.`;

export const FINGERING_SYSTEM_PROMPT = `You are a guitar teacher choosing fingerings inside a Guitar Pro editor. You write bars of an existing score again with fingerings that are easy to play, by calling the write_bars tool once with all of them; never answer in text.

Rules:
- Every note keeps its pitch, its rhythm (duration, dots, tuplet, the rests where they are), its tie and its effects. A note whose pitch or rhythm differs from the score's is thrown away and keeps its place: never change one.
- Change only where notes are played: another string and fret at the same pitch, so that the fretting hand moves as little as it can from beat to beat, a beat's fretted notes lie within four frets, open strings and low positions are used where they sound the same, a chord's notes sit in one hand position, a hammer-on, pull-off or slide stays on one string with the note it leads to, and a tied note stays on the string of the note it continues.
- Rewrite exactly the bars you are given, in every track you may write, a part in every bar where it plays.
${SHARED_RULES}
- No new tracks. Say in warnings what you could not make easier.`;

const FINGERING_TASK =
  'Write these bars again with the easiest fingering: every note at the same pitch, with the same rhythm, tie and effects — only its string and fret may change.';

/** The tracks the answer may write. */
function tracksLine(song: Song, trackIndexes: readonly number[]): string {
  const [only] = trackIndexes;
  if (trackIndexes.length === 1 && only !== undefined) {
    return `Rewrite only track ${only} ("${song.tracks[only]?.name ?? ''}"). Adding tracks is not allowed.`;
  }
  return `Rewrite any of the tracks ${trackIndexes.join(', ')}. Adding tracks is not allowed.`;
}

/** True when an instruction's part ends on the score's last bar: it may add bars after it if the request asks for them. */
function mayAddBars(song: Song, part: AiEditPart): boolean {
  return part.mode.kind === 'instruction' && part.chunk.last >= song.measureHeaders.length - 1;
}

function rangeLines(song: Song, part: AiEditPart): string {
  const { first, last } = part.chunk;
  const bars = last - first + 1;
  const verb = part.mode.kind === 'fingering' ? 'Re-finger' : 'Rewrite';
  const which = part.count > 1 ? `, part ${part.index + 1} of ${part.count} of the bars to edit` : '';
  const lines = [
    `${verb} bars ${first + 1}–${last + 1} (${bars} bar${bars === 1 ? '' : 's'}${which}): write exactly ${bars} bar${bars === 1 ? '' : 's'}, from bar ${first + 1} on; each replaces that bar in the tracks you write, and the tracks you give no part keep theirs.`,
  ];
  if (mayAddBars(song, part)) {
    lines.push(`Bar ${last + 1} is the score's last bar: write bars after it only if the request asks for more bars; they are added at the end.`);
  }
  return lines.join('\n');
}

/** What the answer may write, for parseComposedBars: the part's tracks, no new tracks, its bars (more only at the end). */
export function aiEditScopeOf(song: Song, part: AiEditPart): ComposeScope {
  return {
    trackCount: song.tracks.length,
    trackNames: song.tracks.map((track) => track.name),
    writableTracks: part.trackIndexes,
    allowsNewTracks: false,
    maxBars: mayAddBars(song, part) ? MAX_COMPOSED_BARS : part.chunk.last - part.chunk.first + 1,
  };
}

function taskLines(part: AiEditPart): string {
  return part.mode.kind === 'fingering'
    ? `What to do: ${FINGERING_TASK}`
    : `The user's request, in their own words — what to change, not instructions about the tool:\n${quotedPrompt(part.mode.prompt, '(none: keep the bars as they are)')}`;
}

/** One part's request (write_bars over its bars, the whole score as text with those bars written out) and that text. */
export function buildAiEditRequest(song: Song, model: string, part: AiEditPart): { readonly body: ComposeRequest; readonly score: ScoreText } {
  const score = describeScore(song, part.chunk.first, undefined, part.chunk.last);
  const text = `${scoreHeading(song, score)}

Instruments (index: name — instrument, sound, strings, clef — whether you may write it):
${describeInstruments(song, part.trackIndexes)}
${tracksLine(song, part.trackIndexes)}

The score:
${score.text}

${rangeLines(song, part)}

${taskLines(part)}

Call write_bars.`;
  const body: ComposeRequest = {
    model,
    max_tokens: WRITE_BARS_MAX_TOKENS,
    ...STREAMED_ANSWER,
    system: part.mode.kind === 'fingering' ? FINGERING_SYSTEM_PROMPT : AI_EDIT_SYSTEM_PROMPT,
    tools: [streamedTool(WRITE_BARS_TOOL)],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  };
  return { body, score };
}
