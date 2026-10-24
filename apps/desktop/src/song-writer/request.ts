// i18n-exempt-file: the prompts and requests sent to Claude, in English whatever the app's language
import { MAX_PLAN_BARS, MAX_PLAN_SECTIONS, MAX_SECTION_BARS, PLAN_SONG_TOOL, type SongPlan, WRITE_SECTION_TOOL } from '@gp-editor/core';

/** What the user asks the song writer for (Edit ▸ AI Wizard ▸ Song Writer…). */
export interface SongIdea {
  readonly title: string;
  readonly genre: string;
  /** How long the song should play. */
  readonly lengthSeconds: number;
  /** "" for none: the model writes its own (or none for an instrumental). */
  readonly lyrics: string;
  readonly description: string;
  /** The open score, described by describeReference, when the user asks to build on it. */
  readonly reference?: string;
}

/** Room for the plan, and for a section's measures on every track. */
const PLAN_MAX_TOKENS = 8000;
const SECTION_MAX_TOKENS = 32000;

export const SONG_WRITER_SYSTEM_PROMPT = `You are a songwriter and arranger. You write original songs for guitar and bass, notated as Guitar Pro tablature: first a plan (plan_song), then each section's measures (write_section) when asked.

Arrangement:
- 2 to 4 tracks: a lead guitar that plays the sung melody (the lyrics track), usually a rhythm guitar (chords: strummed, picked or arpeggiated as the genre calls for) and a bass (roots, fifths, approach notes, one note at a time). Standard tuning unless the genre calls for another (e.g. Drop D for heavy styles); capo 0 unless it helps.
- The melody is singable: about an octave and a half, mostly stepwise with a few leaps, phrases that breathe (rests between lines), a memorable hook in the chorus. One note at a time.
- Chords use real fingerings that a guitarist can play; the bass locks with the rhythm guitar.
- Sections develop: intro, verses, choruses, maybe a bridge or solo and an outro; the chorus lifts (higher, fuller); the ending resolves.

Notation (write_section):
- Every note as string and fret (string 1 = the highest string), never as a pitch.
- Every measure has one part per track (track index), and each part's durations fill the measure exactly: rests where a track is silent.
- The lyrics track: give each measure's lyrics — one syllable per beat that has notes, in order; "" for a note not sung; a word over several notes split with hyphens ("beau-", "ti-", "ful"). Sing the given lyrics as written, in order, in their language. In Korean or Japanese every character is one syllable: one character per note, no hyphens.
- Use effects only where they suit the style (hammer, slide, bend, vibrato, palmMute, letRing, deadNote, ghostNote, accent, harmonic), and dots and triplets (tuplet 3) where the rhythm needs them.

Write original music; do not copy existing songs' melodies or lyrics.`;

/** "1:30" for 90 seconds. */
export function lengthLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** How long a plan plays, in seconds: its bars at its tempo (quarter notes per minute). */
export function planSeconds(plan: SongPlan): number {
  const quartersPerBar = (plan.timeSignature.numerator * 4) / plan.timeSignature.denominator;
  const bars = plan.sections.reduce((total, section) => total + section.bars, 0);
  return (bars * quartersPerBar * 60) / plan.tempo;
}

interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

export interface SongWriterRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly tools: readonly (typeof PLAN_SONG_TOOL | typeof WRITE_SECTION_TOOL)[];
  readonly tool_choice: { readonly type: 'tool'; readonly name: string };
  readonly messages: readonly { readonly role: 'user'; readonly content: readonly TextBlock[] }[];
}

function request(model: string, maxTokens: number, tool: typeof PLAN_SONG_TOOL | typeof WRITE_SECTION_TOOL, text: string): SongWriterRequest {
  return {
    model,
    max_tokens: maxTokens,
    system: SONG_WRITER_SYSTEM_PROMPT,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  };
}

function lyricsLines(idea: SongIdea): string {
  const lyrics = idea.lyrics.trim();
  return lyrics === ''
    ? 'Lyrics: none given. Write original lyrics that fit the title and the description, unless the description asks for an instrumental.'
    : `Lyrics (use them as written, in order, spread over the sung sections; leave instrumental sections without lyrics):\n${lyrics}`;
}

function referenceLines(idea: SongIdea): string {
  return idea.reference === undefined
    ? ''
    : `\n\nReference — the score open in the editor. Build the song on its melody, rhythm and feel: develop its motifs, keep its groove.\n${idea.reference}`;
}

/** The first request: the plan of the song (plan_song). */
export function buildPlanRequest(model: string, idea: SongIdea): SongWriterRequest {
  const text = `Plan a new song.
Title: ${idea.title.trim() || '(choose one)'}
Genre: ${idea.genre.trim() || '(choose one that suits the description)'}
Length: about ${lengthLabel(idea.lengthSeconds)} (${Math.round(idea.lengthSeconds)} seconds). Choose the tempo and meter, then sections whose bars add up to that length: total bars ≈ seconds × tempo ÷ 60 ÷ quarter notes per bar. At most ${MAX_PLAN_BARS} bars and ${MAX_PLAN_SECTIONS} sections; a section has at most ${MAX_SECTION_BARS} bars.
Description: ${idea.description.trim() || '(none)'}
${lyricsLines(idea)}${referenceLines(idea)}

Call plan_song.`;
  return request(model, PLAN_MAX_TOKENS, PLAN_SONG_TOOL, text);
}

/** The plan as the section requests restate it: tracks with their indexes, then every section. */
function describePlan(plan: SongPlan): string {
  const tracks = plan.tracks.map((track, index) => `track ${index}: "${track.name}" (${track.instrument}, ${track.tuning.join(' ')}, capo ${track.capo})`);
  const sections = plan.sections.map((section, index) => `${index + 1}. ${section.name} — ${section.bars} bars; chords: ${section.chords || '-'}; ${section.lyrics ? `lyrics: ${section.lyrics}` : 'instrumental'}; ${section.idea}`);
  const key = plan.keySignature === 0 ? 'no sharps or flats' : `${Math.abs(plan.keySignature)} ${plan.keySignature > 0 ? 'sharp' : 'flat'}${Math.abs(plan.keySignature) === 1 ? '' : 's'}`;
  return `"${plan.title}": ♩ = ${plan.tempo}, ${plan.timeSignature.numerator}/${plan.timeSignature.denominator}, key signature with ${key}.
Tracks: ${tracks.join('; ')}. The lyrics track is track ${plan.lyricsTrack}.
Sections:
${sections.join('\n')}`;
}

function neighbours(plan: SongPlan, index: number): string {
  const before = plan.sections[index - 1];
  const after = plan.sections[index + 1];
  const parts = [before === undefined ? 'it opens the song' : `it comes after "${before.name}"`, after === undefined ? 'it ends the song' : `before "${after.name}"`];
  return `${parts.join(' and ')}: make the joins natural (pickups, fills, a final cadence at the end).`;
}

/** A later request: the measures of plan.sections[index] (write_section). */
export function buildSectionRequest(model: string, idea: SongIdea, plan: SongPlan, index: number): SongWriterRequest {
  const section = plan.sections[index];
  const name = section?.name ?? `Section ${index + 1}`;
  const bars = section?.bars ?? 1;
  const text = `The plan of the song (from plan_song), genre ${idea.genre.trim() || 'as planned'}:
${describePlan(plan)}

Now write section ${index + 1} of ${plan.sections.length}, "${name}": exactly ${bars} measures in ${plan.timeSignature.numerator}/${plan.timeSignature.denominator}, ${neighbours(plan, index)}
Chords: ${section?.chords || 'as you see fit'}
${section?.lyrics ? `Lyrics sung in it: ${section.lyrics}` : 'Instrumental: no lyrics.'}
Idea: ${section?.idea || '-'}
Every measure has a part for each of the ${plan.tracks.length} tracks.${referenceLines(idea)}

Call write_section with exactly ${bars} measures.`;
  return request(model, SECTION_MAX_TOKENS, WRITE_SECTION_TOOL, text);
}
