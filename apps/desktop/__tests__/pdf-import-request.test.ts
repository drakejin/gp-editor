import { TRANSCRIPTION_TOOL, type TranscriptionPage } from '@gp-editor/core';
import { DEFAULT_TRANSCRIPTION_MODEL, buildTranscriptionRequest } from '../src/pdf-import/request';

const FIRST_PAGE: TranscriptionPage = {
  song: { title: 'Etude', tempo: 96 },
  tracks: [{ name: 'Guitar', instrument: 'guitar', tuning: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 2 }],
  measures: [
    { timeSignature: { numerator: 3, denominator: 4 }, keySignature: 1, parts: [{ track: 0, beats: [{ duration: 'half', dots: 1, rest: true }] }] },
  ],
};

describe('buildTranscriptionRequest', () => {
  it('sends one PDF page and forces the transcription tool', () => {
    // Act
    const body = buildTranscriptionRequest({ model: DEFAULT_TRANSCRIPTION_MODEL, pdfBase64: 'JVBERi0x', page: 1, pageCount: 3, title: 'Etude' });

    // Assert
    expect(body).toMatchObject({ model: 'claude-opus-5-5', tools: [TRANSCRIPTION_TOOL], tool_choice: { type: 'tool', name: 'record_transcription' } });
    const [content] = body.messages;
    expect(content?.content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' } });
    expect(content?.content[1]?.text).toContain('page 1 of 3');
    expect(content?.content[1]?.text).toContain('song and its tracks');
    expect(body.system).toContain('string 1');
  });

  it('tells a later page what the first page found: tracks, tuning, capo, time signature, tempo and key', () => {
    const body = buildTranscriptionRequest({ model: 'claude-sonnet-5', pdfBase64: 'x', page: 2, pageCount: 3, title: 'Etude', firstPage: FIRST_PAGE });
    const text = body.messages[0]?.content[1]?.text ?? '';
    expect(body.model).toBe('claude-sonnet-5');
    expect(text).toContain('track 0: Guitar (guitar; D2 A2 D3 G3 B3 E4; capo 2)');
    expect(text).toContain('3/4');
    expect(text).toContain('♩ = 96');
    expect(text).toContain('1 sharp');
  });
});
