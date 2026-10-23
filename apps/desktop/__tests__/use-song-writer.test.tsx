import ReactTestRenderer from 'react-test-renderer';
import type { Song } from '@gp-editor/core';
import { type SongWriter, songFileName, stepLabel, useSongWriter, writtenSummary } from '../src/hooks/use-song-writer';
import { makeSong } from '../test-support/songs';
import type { ApiResponse } from '../src/native/anthropic';

const mockSend = jest.fn<Promise<ApiResponse>, [string]>();

jest.mock('../src/native/anthropic', () => ({
  sendMessages: (body: string) => mockSend(body),
}));

const PLAN = {
  title: 'Paper Boats',
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  keySignature: 0,
  tracks: [{ name: 'Lead guitar', instrument: 'guitar', tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 0 }],
  lyricsTrack: 0,
  sections: [{ name: 'Verse', bars: 1, chords: 'C', lyrics: '', idea: '' }],
};

function answer(name: string, input: unknown): ApiResponse {
  return { status: 200, body: JSON.stringify({ content: [{ type: 'tool_use', name, input }], usage: { input_tokens: 1, output_tokens: 1 } }) };
}

function render(onWritten = jest.fn()) {
  let writer: SongWriter | undefined;
  function Probe() {
    writer = useSongWriter(onWritten);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return { current: () => writer!, onWritten };
}

async function flush(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => mockSend.mockReset());

describe('useSongWriter', () => {
  it('opens and closes, keeping the draft', () => {
    // Arrange
    const writer = render();

    // Act
    ReactTestRenderer.act(() => {
      writer.current().open();
      writer.current().changeDraft({ title: 'Paper Boats', lengthSeconds: 120 });
      writer.current().close();
    });

    // Assert
    expect(writer.current().isOpen).toBe(false);
    expect(writer.current().draft).toMatchObject({ title: 'Paper Boats', lengthSeconds: 120, genre: '' });
  });

  it('writes the song from the draft, hands it over and closes', async () => {
    // Arrange
    mockSend.mockImplementation(async (body) => (JSON.parse(body).tool_choice.name === 'plan_song' ? answer('plan_song', PLAN) : answer('write_section', { measures: [{ parts: [{ track: 0, beats: [{ duration: 'whole', notes: [{ string: 1, fret: 0 }] }] }] }] })));
    const writer = render();
    ReactTestRenderer.act(() => {
      writer.current().open();
      writer.current().changeDraft({ title: 'Paper Boats' });
    });

    // Act
    ReactTestRenderer.act(() => writer.current().write('claude-opus-5-5', undefined));
    await flush();

    // Assert
    const [song, fileName] = writer.onWritten.mock.calls[0] as [Song, string];
    expect(song.info.title).toBe('Paper Boats');
    expect(fileName).toBe('Paper Boats');
    expect(writer.current().status).toEqual({ kind: 'idle' });
    expect(writer.current().isOpen).toBe(false);
  });

  it('says why it failed and stays open', async () => {
    mockSend.mockResolvedValue({ status: 400, body: '{"error":{"message":"Your credit balance is too low"}}' });
    const writer = render();
    ReactTestRenderer.act(() => writer.current().open());
    ReactTestRenderer.act(() => writer.current().write('m', undefined));
    await flush();
    expect(writer.current().status).toEqual({ kind: 'failed', message: 'Your credit balance is too low' });
    expect(writer.current().isOpen).toBe(true);
  });
});

describe('song writer wording', () => {
  it('names the step', () => {
    expect(stepLabel({ kind: 'planning' })).toBe('Planning the song…');
    expect(stepLabel({ kind: 'writing', written: 3, total: 8, writing: ['Chorus', 'Verse 2'] })).toBe('Writing Chorus, Verse 2… (3 of 8 sections done)');
  });

  it('makes a file name from the title', () => {
    expect([songFileName('Paper Boats'), songFileName('  '), songFileName('AC/DC: live')]).toEqual(['Paper Boats', 'New song', 'AC-DC- live']);
  });
});

describe('writtenSummary', () => {
  it('says what was written, and the first note when there are some', () => {
    // Arrange
    const song = { ...makeSong([[], [], []]), info: { ...makeSong([[]]).info, title: 'Paper Boats' } };

    // Act + Assert
    expect(writtenSummary(song, [])).toBe('Song Writer: “Paper Boats” — 3 bars, 1 track.');
    expect(writtenSummary(song, ['Chorus: kept short', 'Bar 3: …'])).toBe('Song Writer: “Paper Boats” — 3 bars, 1 track. 2 notes: Chorus: kept short …');
  });
});
