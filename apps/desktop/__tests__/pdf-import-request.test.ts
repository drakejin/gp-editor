import { PAGE_PITCH_RULE, TRANSCRIPTION_TOOL, type TranscriptionPage } from '@gp-editor/core';
import { drumStaffGuide } from '../src/pdf-import/drum-staff-guide';
import { DEFAULT_TRANSCRIPTION_MODEL, TRANSCRIPTION_MODELS, TRANSCRIPTION_SYSTEM_PROMPT, buildTranscriptionRequest } from '../src/pdf-import/request';

const FIRST_PAGE: TranscriptionPage = {
  song: { title: 'Etude', tempo: 96 },
  tracks: [{ name: 'Guitar', instrument: 'guitar', tuning: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 2 }],
  measures: [
    { timeSignature: { numerator: 3, denominator: 4 }, keySignature: 1, parts: [{ track: 0, beats: [{ duration: 'half', dots: 1, rest: true }] }] },
  ],
};

describe('buildTranscriptionRequest', () => {
  it('sends one PDF page and asks for the transcription tool by name', () => {
    // Act
    const body = buildTranscriptionRequest({ model: DEFAULT_TRANSCRIPTION_MODEL, pdfBase64: 'JVBERi0x', page: 1, pageCount: 3, title: 'Etude' });

    // Assert
    expect(body).toMatchObject({ model: 'claude-opus-5-5', tool_choice: { type: 'auto' } });
    expect(body.tools).toEqual([{ ...TRANSCRIPTION_TOOL, eager_input_streaming: true }]);
    const [content] = body.messages;
    expect(content?.content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' } });
    expect(content?.content[1]?.text).toContain('page 1 of 3');
    expect(content?.content[1]?.text).toContain('song and its tracks');
    expect(content?.content[1]?.text).toContain('Call record_transcription');
    expect(body.system).toContain('string 1');
    expect(body.system).toContain('never answer in text');
  });

  it('never forces the tool call, which Claude Opus 5.5 and Sonnet 5.5 refuse with a 400', () => {
    for (const { id } of TRANSCRIPTION_MODELS) {
      // Act
      const body = buildTranscriptionRequest({ model: id, pdfBase64: 'x', page: 2, pageCount: 3, title: 'Etude', firstPage: FIRST_PAGE });

      // Assert: no sampling parameters, and no thinking but adaptive (disabled or budgeted thinking is a 400 too)
      expect(body.tool_choice).toEqual({ type: 'auto' });
      for (const rejected of ['temperature', 'top_p', 'top_k']) {
        expect(body).not.toHaveProperty(rejected);
      }
      expect(body.thinking.type).toBe('adaptive');
    }
  });

  it('asks for an empty transcription with a warning on a page without music', () => {
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain('no music');
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

const BAND_PAGE: TranscriptionPage = {
  song: { title: 'Band', tempo: 120, lyricsTrack: 1 },
  tracks: [
    { name: 'Drums', instrument: 'drums', tuning: [], capo: 0 },
    { name: 'Lead Vocals', instrument: 'vocals', tuning: [], capo: 0 },
    { name: 'Guitar', instrument: 'guitar', tuning: [], capo: 0 },
    { name: 'Piano (right hand)', instrument: 'keys', tuning: [], capo: 0, clef: 'treble' },
    { name: 'Piano (left hand)', instrument: 'keys', tuning: [], capo: 0, clef: 'bass' },
    { name: 'Violin', instrument: 'other', tuning: [], capo: 0, program: 40 },
  ],
  measures: [{ parts: [] }],
};

describe('the transcription prompt: every staff', () => {
  it('asks for every staff, top to bottom, drums, vocals, keyboards and other instruments included', () => {
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain('every staff');
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain('top to bottom');
    expect(TRANSCRIPTION_SYSTEM_PROMPT).not.toContain('Leave out vocal');
    for (const instrument of ['drums', 'vocals', 'keys', 'other', 'ukulele', 'banjo']) {
      expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain(instrument);
    }
  });

  it('asks for each staff’s pitches by the one rule the song is built by: written for a guitar, bass or banjo, sounding for the rest', () => {
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain(PAGE_PITCH_RULE);
    expect(JSON.stringify(TRANSCRIPTION_TOOL)).toContain(JSON.stringify(PAGE_PITCH_RULE).slice(1, -1));
  });

  it('makes a grand staff two keys tracks, right hand then left hand', () => {
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain('"Piano (right hand)"');
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain('"Piano (left hand)"');
  });

  it('says how to read a drum staff, from the kit the app draws drums with, and that a legend on the page wins', () => {
    // Arrange
    const guide = drumStaffGuide();

    // Assert
    expect(guide).toEqual(expect.arrayContaining(['  - F4 (first space), round: Bass Drum 1', '  - C5 (third space), round: Acoustic Snare', '  - G5 (space above the staff), x: Closed Hi-Hat', '  - A5 (first ledger line above), x: Crash Cymbal 1', '  - F5 (top line), x: Ride Cymbal 1', '  - D4 (space below the staff), x: Pedal Hi-Hat']));
    for (const line of guide) {
      expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain(line);
    }
    expect(TRANSCRIPTION_SYSTEM_PROMPT).toContain('legend');
  });

  it('leaves room for a dense full-band page and the thinking before it', () => {
    const body = buildTranscriptionRequest({ model: DEFAULT_TRANSCRIPTION_MODEL, pdfBase64: 'x', page: 1, pageCount: 1, title: 'Band' });
    expect(body.max_tokens).toBe(64000);
  });

  it('asks for the answer as a stream that never goes quiet: thinking summarised, the tool input sent as it is written', () => {
    for (const { id } of TRANSCRIPTION_MODELS) {
      // Act
      const body = buildTranscriptionRequest({ model: id, pdfBase64: 'x', page: 2, pageCount: 2, title: 'Band', firstPage: FIRST_PAGE });

      // Assert
      expect(body.stream).toBe(true);
      expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
      expect(body.tools.map((tool) => tool.eager_input_streaming)).toEqual([true]);
    }
  });

  it('tells a later page every track page 1 found, with its instrument, clef and program, and which track sings', () => {
    // Act
    const text = buildTranscriptionRequest({ model: DEFAULT_TRANSCRIPTION_MODEL, pdfBase64: 'x', page: 2, pageCount: 2, title: 'Band', firstPage: BAND_PAGE }).messages[0]?.content[1]?.text ?? '';

    // Assert
    expect(text).toContain('track 0: Drums (drums)');
    expect(text).toContain('track 1: Lead Vocals (vocals)');
    expect(text).toContain('track 2: Guitar (guitar)');
    expect(text).toContain('track 3: Piano (right hand) (keys; treble clef)');
    expect(text).toContain('track 4: Piano (left hand) (keys; bass clef)');
    expect(text).toContain('track 5: Violin (other; program 40)');
    expect(text).toContain('The lyrics are sung on track 1 (Lead Vocals).');
  });

  it('names the first vocal track as the singing one when page 1 named none', () => {
    const page = { ...BAND_PAGE, song: { title: 'Band' } };
    const text = buildTranscriptionRequest({ model: DEFAULT_TRANSCRIPTION_MODEL, pdfBase64: 'x', page: 2, pageCount: 2, title: 'Band', firstPage: page }).messages[0]?.content[1]?.text ?? '';
    expect(text).toContain('The lyrics are sung on track 1 (Lead Vocals).');
  });

  it('asks page 1 for every staff’s track', () => {
    const text = buildTranscriptionRequest({ model: DEFAULT_TRANSCRIPTION_MODEL, pdfBase64: 'x', page: 1, pageCount: 2, title: 'Band' }).messages[0]?.content[1]?.text ?? '';
    expect(text).toContain('every staff');
  });
});
