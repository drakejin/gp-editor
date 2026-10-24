import { type Song, type Track, readSong } from '@gp-editor/core';
import { type DrawCommand, SMUFL, type TextCommand } from '../src/score/draw';
import { CLEF_CHANGE_SCALE, MUSIC_FONT_SIZE } from '../src/score/notation/metrics';
import { engraveSystemStaff, staffDecor } from '../src/score/system-staff';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';
import { layoutMeasure, layoutRows } from '../src/lib/layout';
import { DEFAULT_CHORD_DISPLAY, chordBands, chordBeatWidth } from '../src/score/chords';
import { hasDirections } from '../src/score/directions';
import { hasDynamicChanges } from '../src/score/dynamics';
import { SCORE_MODES, rowGeometry } from '../src/score/geometry';
import { hasLyrics } from '../src/score/lyrics';
import { hasPedals } from '../src/score/pedals';
import { engraveRow, rowHeaderWidth } from '../src/score/row';
import { SYSTEM, layoutScore, scoreMeasures, shortTrackName, staffLabel, staffPlans } from '../src/score/score-layout';
import { hasBends } from '../src/score/symbols/bends';
import { tabMarkLanes } from '../src/score/tab';
import { readFixture } from '../test-support/fixtures';

const ROW_WIDTH = 1000;

describe('layoutScore with one track', () => {
  const song = readSong(readFixture('guitarpro5', 'canon.gp5'));

  it.each(SCORE_MODES)('lays the track out as the single-track score always has (%s)', (mode) => {
    // Arrange: what ScoreView computed before the multitrack view
    const track = song.tracks[1]!;
    const markLanes = tabMarkLanes(track.measures);
    const geometry = rowGeometry(mode, track.strings.length, {
      markLaneCount: markLanes.length,
      hasDynamics: hasDynamicChanges(track.measures),
      hasBends: hasBends(track.measures),
      hasLyrics: hasLyrics(track),
      ...chordBands(track.measures, DEFAULT_CHORD_DISPLAY),
      hasDirections: hasDirections(song),
      hasPedals: hasPedals(track.measures),
    });
    const headerWidth = rowHeaderWidth(mode, track);
    const measures = song.measureHeaders.map((_, i) => layoutMeasure(song, 1, i, (each) => chordBeatWidth(each, DEFAULT_CHORD_DISPLAY)));

    // Act
    const layout = layoutScore(song, [{ trackIndex: 1, mode }], DEFAULT_CHORD_DISPLAY, ROW_WIDTH);

    // Assert
    expect(layout.staves).toHaveLength(1);
    expect(layout.staves[0]).toMatchObject({ trackIndex: 1, mode, geometry, markLanes, top: 0, height: geometry.height });
    expect(layout.systemHeight).toBe(geometry.height);
    expect(layout.systems.map((system) => system.rows[0])).toEqual(layoutRows(measures, ROW_WIDTH - headerWidth));
    expect(layout.systems.every((system) => system.namesWidth === 0 && system.headerWidth === headerWidth)).toBe(true);
  });
});

describe('layoutScore with several tracks', () => {
  const song = readSong(readFixture('guitarpro5', 'nightwish.gp5'));
  const specs = song.tracks.map((_, trackIndex) => ({ trackIndex, mode: 'notationAndTab' as const }));

  it('stacks one staff group per track, the heading and directions only over the first', () => {
    // Act
    const layout = layoutScore(song, specs, DEFAULT_CHORD_DISPLAY, ROW_WIDTH);
    const [first, second] = layout.staves;

    // Assert
    expect(layout.staves.map((staff) => staff.trackIndex)).toEqual(specs.map((spec) => spec.trackIndex));
    expect(second!.top).toBe(first!.height);
    expect(second!.geometry.notationTop!).toBeLessThan(first!.geometry.notationTop!);
    expect(second!.geometry.directionsY).toBeUndefined();
    expect(second!.hasHeading).toBe(false);
    expect(first!.hasHeading).toBe(true);
    const staffSum = layout.staves.reduce((sum, staff) => sum + staff.geometry.height, 0);
    expect(layout.systemHeight).toBe(staffSum + SYSTEM.gap);
    expect(layout.staves.at(-1)!.height).toBe(layout.staves.at(-1)!.geometry.height + SYSTEM.gap);
  });

  it('gives every staff of a system the same bars and widths, and the first system the full names', () => {
    // Act
    const layout = layoutScore(song, specs, DEFAULT_CHORD_DISPLAY, ROW_WIDTH);

    // Assert
    layout.systems.forEach((system) => {
      expect(system.rows).toHaveLength(specs.length);
      const widths = system.rows.map((row) => row.measures.map((m) => m.width));
      widths.forEach((w) => expect(w).toEqual(widths[0]));
      expect(system.headerWidth).toBe(system.namesWidth + layout.clefWidth);
    });
    const [first, second] = layout.systems;
    expect(first!.namesWidth).toBeGreaterThanOrEqual(second!.namesWidth);
    expect(first!.namesWidth).toBeGreaterThan(0);
    expect(layout.clefWidth).toBe(Math.max(...song.tracks.map((track) => rowHeaderWidth('notationAndTab', track))));
  });

  it('draws each track in its own staves', () => {
    // Act
    const layout = layoutScore(song, [{ trackIndex: 0, mode: 'tab' }, { trackIndex: 1, mode: 'notation' }], DEFAULT_CHORD_DISPLAY, ROW_WIDTH);

    // Assert
    expect(layout.staves[0]!.geometry.notationTop).toBeUndefined();
    expect(layout.staves[1]!.geometry.tabTop).toBeUndefined();
  });
});

describe('track names', () => {
  it('keeps short names and shortens long words to their first letters and a dot', () => {
    expect(shortTrackName('Bass')).toBe('Bass');
    expect(shortTrackName('Distortion Guitar')).toBe('Dist. Guit.');
    expect(shortTrackName('Acoustic Guitar 2')).toBe('Acou. Guit. 2');
    expect(shortTrackName('  ')).toBe('');
  });

  it('labels a staff with its name, or its number when it has none', () => {
    expect(staffLabel({ name: 'Lead', number: 2 }, true)).toBe('Lead');
    expect(staffLabel({ name: 'Electric Guitar', number: 2 }, false)).toBe('Elec. Guit.');
    expect(staffLabel({ name: '', number: 3 }, true)).toBe('Track 3');
  });
});

describe('scoreMeasures reusing the last layout', () => {
  const song = readSong(readFixture('guitarpro5', 'nightwish.gp5'));
  const trackIndexes = song.tracks.map((_, trackIndex) => trackIndex);

  it('keeps the bars an edit left alone and lays out again the edited bar and the one after it', () => {
    // Arrange: bar 10 of track 3 edited (its measure replaced)
    const before = scoreMeasures(song, trackIndexes, DEFAULT_CHORD_DISPLAY);
    const track = song.tracks[3]!;
    const edited = { ...song, tracks: song.tracks.map((t, i) => (i === 3 ? { ...track, measures: track.measures.map((m, j) => (j === 10 ? { ...m } : m)) } : t)) };

    // Act
    const after = scoreMeasures(edited, trackIndexes, DEFAULT_CHORD_DISPLAY, { song, trackIndexes, chordDisplay: DEFAULT_CHORD_DISPLAY, measures: before });

    // Assert
    const kept = after.map((bar, i) => bar === before[i]);
    expect(kept.filter((isKept) => !isKept).length).toBe(2);
    expect(kept[10]).toBe(false);
    expect(kept[11]).toBe(false);
    expect(after).toEqual(scoreMeasures(edited, trackIndexes, DEFAULT_CHORD_DISPLAY));
  });

  it('lays everything out again for other tracks or chord display', () => {
    const before = scoreMeasures(song, trackIndexes, DEFAULT_CHORD_DISPLAY);
    const cache = { song, trackIndexes, chordDisplay: DEFAULT_CHORD_DISPLAY, measures: before };
    expect(scoreMeasures(song, [0, 1], DEFAULT_CHORD_DISPLAY, cache).some((bar, i) => bar === before[i])).toBe(false);
    expect(scoreMeasures(song, trackIndexes, { showsNames: false, showsDiagrams: false }, cache).some((bar, i) => bar === before[i])).toBe(false);
  });
});

describe('staffPlans reusing the last layout', () => {
  const song = readSong(readFixture('guitarpro5', 'nightwish.gp5'));
  const specs = song.tracks.map((_, trackIndex) => ({ trackIndex, mode: 'notationAndTab' as const }));

  it('keeps the plans of the tracks an edit left alone', () => {
    // Arrange: track 3 edited
    const before = staffPlans(song, specs, DEFAULT_CHORD_DISPLAY);
    const edited = { ...song, tracks: song.tracks.map((track, i) => (i === 3 ? { ...track } : track)) };

    // Act
    const after = staffPlans(edited, specs, DEFAULT_CHORD_DISPLAY, { song, chordDisplay: DEFAULT_CHORD_DISPLAY, plans: before });

    // Assert
    expect(after.map((plan, i) => plan === before[i])).toEqual(specs.map((_, i) => i !== 3));
    expect(after).toEqual(staffPlans(edited, specs, DEFAULT_CHORD_DISPLAY));
  });

  it('makes the top staff’s plan again when the bar headers change (its directions band)', () => {
    const before = staffPlans(song, specs, DEFAULT_CHORD_DISPLAY);
    const edited = { ...song, measureHeaders: [...song.measureHeaders] };
    const after = staffPlans(edited, specs, DEFAULT_CHORD_DISPLAY, { song, chordDisplay: DEFAULT_CHORD_DISPLAY, plans: before });
    expect(after.map((plan, i) => plan === before[i])).toEqual(specs.map((_, i) => i !== 0));
  });
});

describe('octave signs and clef changes in a multitrack system', () => {
  /** Two guitars over three bars; the second has an 8va over bar 2's first two beats and a bass clef from bar 3. */
  function twoTracks(): Song {
    const bar = (start: number) => [0, 1, 2, 3].map((i) => beat(start + i * 960, [note(1, 0)]));
    const base = makeSong([bar(960), bar(4800), bar(8640)]);
    const [first] = base.tracks;
    const second: Track = {
      ...first!,
      number: 2,
      name: 'Second',
      measures: first!.measures.map((measure, index) => ({
        ...measure,
        ...(index === 2 ? { clef: 'bass' as const } : {}),
        beats: index === 1 ? measure.beats.map((b, i) => (i < 2 ? { ...b, ottava: '8va' as const } : b)) : measure.beats,
      })),
    };
    return { ...base, tracks: [first!, second] };
  }

  it('engraves the second staff’s octave signs and cue-size clef change as the track’s own score does', () => {
    // Arrange
    const song = twoTracks();
    const layout = layoutScore(song, [{ trackIndex: 0, mode: 'notation' }, { trackIndex: 1, mode: 'notation' }], DEFAULT_CHORD_DISPLAY, 2000);
    const [system] = layout.systems;
    const staff = layout.staves[1]!;
    const alone = layoutScore(song, [{ trackIndex: 1, mode: 'notation' }], DEFAULT_CHORD_DISPLAY, 2000);
    const texts = (all: readonly DrawCommand[], text: string) => all.filter((c): c is TextCommand => c.kind === 'text' && c.text === text);
    const cueClefs = (all: readonly DrawCommand[]) => texts(all, SMUFL.fClef8vb).filter((c) => c.size === MUSIC_FONT_SIZE * CLEF_CHANGE_SCALE);

    // Act
    const inSystem = engraveSystemStaff(
      { song, trackIndex: 1, row: system!.rows[1]!, headerWidth: layout.clefWidth, mode: staff.mode, geometry: staff.geometry, palette: PALETTE, hasHeading: staff.hasHeading },
      staffDecor(song, layout, 0, 1)!,
    );
    const ownScore = engraveRow({
      song, trackIndex: 1, row: alone.systems[0]!.rows[0]!, headerWidth: alone.clefWidth, mode: 'notation', geometry: alone.staves[0]!.geometry, palette: PALETTE, hasHeading: true,
    });
    const topStaff = engraveSystemStaff(
      { song, trackIndex: 0, row: system!.rows[0]!, headerWidth: layout.clefWidth, mode: layout.staves[0]!.mode, geometry: layout.staves[0]!.geometry, palette: PALETTE, hasHeading: true },
      staffDecor(song, layout, 0, 0)!,
    );

    // Assert: the 8va over bar 2 (and the one bar 3's high notes take in the bass clef), the small bass clef at bar 3
    const shift = staff.geometry.notationTop! - alone.staves[0]!.geometry.notationTop!;
    expect(system!.rows[1]!.measures[2]!.clefChangeX).toBeDefined();
    const ys = (all: readonly TextCommand[], by = 0) => all.map((c) => Math.round((c.y + by) * 1000) / 1000);
    expect(ys(texts(inSystem, '8va'))).toEqual(ys(texts(ownScore, '8va'), shift));
    expect(texts(inSystem, '8va').length).toBeGreaterThan(0);
    expect(cueClefs(inSystem)).toHaveLength(1);
    expect(cueClefs(ownScore)).toHaveLength(1);
    expect(texts(topStaff, '8va')).toHaveLength(0);
  });
});
