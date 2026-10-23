import { PLAN_SONG_TOOL, type SongPlan, WRITE_SECTION_TOOL } from '@gp-editor/core';
import { type SongIdea, buildPlanRequest, buildSectionRequest, lengthLabel, planSeconds } from '../src/song-writer/request';

const IDEA: SongIdea = {
  title: 'Paper Boats',
  genre: 'Indie folk',
  lengthSeconds: 90,
  lyrics: 'Paper boats on the river\nCarry all my words away',
  description: 'A quiet song about letting go',
};

const PLAN: SongPlan = {
  title: 'Paper Boats',
  tempo: 96,
  timeSignature: { numerator: 4, denominator: 4 },
  keySignature: -1,
  tracks: [
    { name: 'Lead guitar', instrument: 'guitar', tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 0 },
    { name: 'Bass', instrument: 'bass', tuning: ['E1', 'A1', 'D2', 'G2'], capo: 0 },
  ],
  lyricsTrack: 0,
  sections: [
    { name: 'Intro', bars: 4, chords: 'Dm | Bb | F | C', lyrics: '', idea: 'Quiet arpeggios' },
    { name: 'Verse 1', bars: 8, chords: 'Dm | Bb | F | C', lyrics: 'Paper boats on the river', idea: 'Melody low' },
    { name: 'Outro', bars: 2, chords: 'Dm', lyrics: '', idea: 'Fade' },
  ],
  warnings: [],
};

const userText = (request: { messages: readonly { content: readonly { type: string; text?: string }[] }[] }) =>
  request.messages[0]?.content.find((block) => block.type === 'text')?.text ?? '';

describe('buildPlanRequest', () => {
  it('forces plan_song and passes on the title, genre, length, lyrics and description', () => {
    // Act
    const request = buildPlanRequest('claude-opus-5-5', IDEA);

    // Assert
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.tools).toEqual([PLAN_SONG_TOOL]);
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'plan_song' });
    const text = userText(request);
    for (const part of ['Paper Boats', 'Indie folk', '1:30', 'Carry all my words away', 'letting go']) {
      expect(text).toContain(part);
    }
    expect(text).not.toContain('Reference');
  });

  it('adds the open score as a reference when there is one', () => {
    const text = userText(buildPlanRequest('m', { ...IDEA, reference: 'Bar 1: q:E4@1/0' }));
    expect(text).toContain('Bar 1: q:E4@1/0');
  });

  it('asks for original lyrics when none are given', () => {
    expect(userText(buildPlanRequest('m', { ...IDEA, lyrics: '  ' }))).toContain('Write original lyrics');
  });
});

describe('buildSectionRequest', () => {
  it('forces write_section for one section of the plan, with its neighbours and the bar count', () => {
    // Act
    const request = buildSectionRequest('m', IDEA, PLAN, 1);

    // Assert
    expect(request.tools).toEqual([WRITE_SECTION_TOOL]);
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'write_section' });
    const text = userText(request);
    expect(text).toContain('section 2 of 3, "Verse 1"');
    expect(text).toContain('exactly 8 measures');
    expect(text).toContain('Paper boats on the river');
    expect(text).toContain('after "Intro"');
    expect(text).toContain('before "Outro"');
    expect(text).toContain('"Lead guitar"');
  });
});

describe('song length', () => {
  it('says a length as minutes and seconds', () => {
    expect([lengthLabel(90), lengthLabel(45), lengthLabel(120)]).toEqual(['1:30', '0:45', '2:00']);
  });

  it('works out how long a plan plays', () => {
    // 14 bars of 4/4 at 96 BPM: 56 quarters = 35 s
    expect(planSeconds(PLAN)).toBeCloseTo(35);
  });
});
