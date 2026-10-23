import type { ApiResponse } from '../src/native/anthropic';
import { type SongWriterDeps, type SongWriterStep, writeSong } from '../src/song-writer/run-song-writer';
import type { SongIdea } from '../src/song-writer/request';

const IDEA: SongIdea = { title: 'Paper Boats', genre: 'Folk', lengthSeconds: 20, lyrics: 'Pa-per boats', description: '' };

const GUITAR = { name: 'Lead guitar', instrument: 'guitar', tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 0 };

const PLAN_INPUT = {
  title: 'Paper Boats',
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  keySignature: 0,
  tracks: [GUITAR],
  lyricsTrack: 0,
  sections: [
    { name: 'Intro', bars: 1, chords: 'C', lyrics: '', idea: '' },
    { name: 'Verse', bars: 2, chords: 'C G', lyrics: 'Pa-per boats', idea: '' },
  ],
};

const wholeNote = (fret: number) => ({ parts: [{ track: 0, beats: [{ duration: 'whole', notes: [{ string: 1, fret }] }] }] });

function toolAnswer(name: string, input: unknown): ApiResponse {
  return {
    status: 200,
    body: JSON.stringify({ content: [{ type: 'tool_use', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50 } }),
  };
}

/** The tool a request forces, and the section it asks for. */
function asked(body: string): { readonly tool: string; readonly section?: string } {
  const request = JSON.parse(body) as { tool_choice: { name: string }; messages: { content: { type: string; text?: string }[] }[] };
  const text = request.messages[0]?.content.find((block) => block.type === 'text')?.text ?? '';
  return { tool: request.tool_choice.name, section: /"(Intro|Verse)"/.exec(text)?.[1] };
}

/** Answers like a model would: the plan, then each section's measures. */
function answering(overrides: { section?: (name: string | undefined, attempt: number) => ApiResponse | undefined } = {}) {
  const attempts = new Map<string, number>();
  return jest.fn(async (body: string): Promise<ApiResponse> => {
    const { tool, section } = asked(body);
    if (tool === 'plan_song') {
      return toolAnswer('plan_song', PLAN_INPUT);
    }
    const attempt = (attempts.get(section ?? '') ?? 0) + 1;
    attempts.set(section ?? '', attempt);
    const overridden = overrides.section?.(section, attempt);
    if (overridden !== undefined) {
      return overridden;
    }
    return section === 'Intro'
      ? toolAnswer('write_section', { measures: [wholeNote(0)] })
      : toolAnswer('write_section', { measures: [{ ...wholeNote(3), lyrics: ['Pa-'] }, { ...wholeNote(5), lyrics: ['per'] }] });
  });
}

function deps(send: SongWriterDeps['send'], isCancelled = () => false): SongWriterDeps {
  return { send, wait: () => Promise.resolve(), isCancelled };
}

describe('writeSong', () => {
  it('plans the song, writes every section and builds it, reporting each step', async () => {
    // Arrange
    const steps: SongWriterStep[] = [];

    // Act
    const result = await writeSong(IDEA, 'claude-opus-5-5', deps(answering()), (step) => steps.push(step));

    // Assert
    expect(result.isOk).toBe(true);
    if (!result.isOk) {
      return;
    }
    expect(result.song.info.title).toBe('Paper Boats');
    expect(result.song.measureHeaders.map((header) => header.marker?.title)).toEqual(['Intro', 'Verse', undefined]);
    expect(result.song.tracks[0]?.lyrics?.text).toBe(' Pa- per');
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 150 });
    expect(steps[0]).toEqual({ kind: 'planning' });
    expect(steps.at(-1)).toEqual({ kind: 'writing', written: 2, total: 2, writing: [] });
  });

  it('asks again when the API is busy', async () => {
    const send = answering({ section: (name, attempt) => (name === 'Verse' && attempt === 1 ? { status: 529, body: '{"error":{"message":"Overloaded"}}' } : undefined) });
    const result = await writeSong(IDEA, 'm', deps(send), () => undefined);
    expect(result.isOk).toBe(true);
  });

  it('fills a section that could not be written with rests, and says so', async () => {
    // Arrange: the verse answer never fits the format
    const send = answering({ section: (name) => (name === 'Verse' ? toolAnswer('write_section', { measures: 'none' }) : undefined) });

    // Act
    const result = await writeSong(IDEA, 'm', deps(send), () => undefined);

    // Assert
    expect(result.isOk && result.song.measureHeaders).toHaveLength(3);
    expect(result.isOk ? result.warnings : result.message).toEqual(expect.arrayContaining([expect.stringMatching(/^Verse: could not be written/)]));
  });

  it('stops at once when the key or the account is refused', async () => {
    // Arrange
    const send = jest.fn(async () => ({ status: 400, body: '{"error":{"message":"Your credit balance is too low"}}' }));

    // Act
    const result = await writeSong(IDEA, 'm', deps(send), () => undefined);

    // Assert
    expect(result).toMatchObject({ isOk: false, message: 'Your credit balance is too low' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('stops when cancelled', async () => {
    const result = await writeSong(IDEA, 'm', deps(answering(), () => true), () => undefined);
    expect(result).toMatchObject({ isOk: false, message: 'Cancelled' });
  });
});
