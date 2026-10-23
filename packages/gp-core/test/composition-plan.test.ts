import { describe, expect, it } from 'vitest';
import { PLAN_SONG_TOOL, WRITE_SECTION_TOOL } from '../src/composition/tool';
import { parseSongPlan } from '../src/composition/parse-plan';
import { MAX_PLAN_BARS, MAX_PLAN_SECTIONS, MAX_PLAN_TRACKS, MAX_SECTION_BARS } from '../src/composition/types';
import { CompositionError } from '../src/errors';

const GUITAR = { name: 'Lead guitar', instrument: 'guitar', tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 0 };
const BASS = { name: 'Bass', instrument: 'bass', tuning: ['E1', 'A1', 'D2', 'G2'], capo: 0 };

function plan(extra: Record<string, unknown> = {}) {
  return {
    title: 'Paper Boats',
    tempo: 96,
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: -1,
    tracks: [GUITAR, BASS],
    lyricsTrack: 0,
    sections: [
      { name: 'Intro', bars: 4, chords: 'Dm Bb F C', lyrics: '', idea: 'Arpeggios, quiet' },
      { name: 'Verse 1', bars: 8, chords: 'Dm Bb F C', lyrics: 'Paper boats on the river', idea: 'Melody low' },
    ],
    ...extra,
  };
}

describe('parseSongPlan', () => {
  it('reads the song, its tracks and its sections', () => {
    // Act
    const parsed = parseSongPlan(plan());

    // Assert
    expect(parsed).toMatchObject({ title: 'Paper Boats', tempo: 96, timeSignature: { numerator: 4, denominator: 4 }, keySignature: -1, lyricsTrack: 0 });
    expect(parsed.tracks.map((track) => track.name)).toEqual(['Lead guitar', 'Bass']);
    expect(parsed.sections).toEqual([
      { name: 'Intro', bars: 4, chords: 'Dm Bb F C', lyrics: '', idea: 'Arpeggios, quiet' },
      { name: 'Verse 1', bars: 8, chords: 'Dm Bb F C', lyrics: 'Paper boats on the river', idea: 'Melody low' },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('clamps what is out of range and falls back where a value is unusable', () => {
    // Act
    const parsed = parseSongPlan(
      plan({ tempo: 900, timeSignature: { numerator: 4, denominator: 3 }, keySignature: 12, lyricsTrack: 5, sections: [{ name: '', bars: 99 }, { bars: 0 }] }),
    );

    // Assert
    expect(parsed).toMatchObject({ tempo: 240, timeSignature: { numerator: 4, denominator: 4 }, keySignature: 7, lyricsTrack: 1 });
    expect(parsed.sections).toEqual([
      { name: 'Section 1', bars: MAX_SECTION_BARS, chords: '', lyrics: '', idea: '' },
      { name: 'Section 2', bars: 1, chords: '', lyrics: '', idea: '' },
    ]);
  });

  it('keeps the sections that fit the song’s bar budget and says what was left out', () => {
    // Act
    const sections = Array.from({ length: MAX_PLAN_SECTIONS }, (_, index) => ({ name: `Part ${index + 1}`, bars: MAX_SECTION_BARS }));
    const parsed = parseSongPlan(plan({ sections }));

    // Assert
    expect(parsed.sections.reduce((bars, section) => bars + section.bars, 0)).toBeLessThanOrEqual(MAX_PLAN_BARS);
    expect(parsed.warnings).toEqual([`The plan had ${MAX_PLAN_SECTIONS * MAX_SECTION_BARS} bars; Part 6 to Part 16 were left out to keep it to ${MAX_PLAN_BARS}`]);
  });

  it.each([
    ['no tracks', { tracks: [] }],
    ['too many tracks', { tracks: Array.from({ length: MAX_PLAN_TRACKS + 1 }, () => GUITAR) }],
    ['no sections', { sections: [] }],
    ['too many sections', { sections: Array.from({ length: MAX_PLAN_SECTIONS + 1 }, () => ({ name: 'A', bars: 1 })) }],
  ])('refuses a plan with %s', (_name, extra) => {
    expect(() => parseSongPlan(plan(extra))).toThrow(CompositionError);
  });

  it('refuses an answer that is not a plan', () => {
    expect(() => parseSongPlan('a song')).toThrow(CompositionError);
  });
});

describe('song writer tools', () => {
  it('plans with plan_song and writes each section’s measures (with lyrics) with write_section', () => {
    expect(PLAN_SONG_TOOL.name).toBe('plan_song');
    expect(WRITE_SECTION_TOOL.name).toBe('write_section');
    expect(JSON.stringify(WRITE_SECTION_TOOL.input_schema)).toContain('"lyrics"');
    expect(WRITE_SECTION_TOOL.input_schema.required).toEqual(['measures']);
  });
});
