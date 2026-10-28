import { DEFAULT_STYLESHEET, EMPTY_SONG_INFO, type Beat, type NotationStyle, type Song, type Stylesheet, setStylesheet } from '@gp-editor/core';
import { buildPdfDocument } from '../src/export/pdf-document';
import { engraveTitleBlock, titleBlockLines } from '../src/export/title-block';
import { DEFAULT_CHORD_DISPLAY } from '../src/score/chords';
import type { DrawCommand, TextCommand } from '../src/score/draw';
import type { ScoreMode } from '../src/score/geometry';
import { engraveRow } from '../src/score/row';
import { layoutScore } from '../src/score/score-layout';
import { PALETTE, texts, textValues } from '../test-support/score-helpers';
import { beat, header, makeSong, note, toTux } from '../test-support/songs';

const QUARTER_TICKS = 960;

/** A bar's four quarter beats from its start, each with `notes(b)`. */
function bar(measureIndex: number, notes: (b: number) => ReturnType<typeof note>[]): Beat[] {
  return Array.from({ length: 4 }, (_, b) => beat(toTux(header(measureIndex + 1).start) + b * QUARTER_TICKS, notes(b)));
}

function styled(song: Song, change: Partial<Stylesheet>): Song {
  return setStylesheet(song, { ...DEFAULT_STYLESHEET, ...change });
}

function notation(change: Partial<NotationStyle>): Partial<Stylesheet> {
  return { notation: { ...DEFAULT_STYLESHEET.notation, ...change } };
}

/** Every command of the score's systems, one track in `mode`. */
function engraved(song: Song, mode: ScoreMode = 'tab', width = 2000): DrawCommand[] {
  const layout = layoutScore(song, [{ trackIndex: 0, mode }], DEFAULT_CHORD_DISPLAY, width);
  const staff = layout.staves[0]!;
  return layout.systems.flatMap((system) =>
    engraveRow({ song, trackIndex: 0, row: system.rows[0]!, headerWidth: layout.clefWidth, mode, geometry: staff.geometry, palette: PALETTE, markLanes: staff.markLanes }),
  );
}

const plainBars = (count: number): Song => makeSong(Array.from({ length: count }, (_, i) => bar(i, (b) => [note(1, b)])));

describe('Texts & Styles in the heading', () => {
  it('numbers only the first bar of each system, or no bar', () => {
    // Arrange
    const song = plainBars(12);
    const numbers = (commands: DrawCommand[]) => texts(commands).filter((text) => text.font === 'ui' && /^\d+$/.test(text.text)).map((text) => text.text);

    // Act
    const atStarts = numbers(engraved(styled(song, { barNumbers: 'systemStart' }), 'tab', 900));
    const none = numbers(engraved(styled(song, { barNumbers: 'hidden' }), 'tab', 900));

    // Assert
    expect(numbers(engraved(song, 'tab', 900))).toHaveLength(12);
    expect(atStarts.length).toBeGreaterThan(1);
    expect(atStarts.length).toBeLessThan(12);
    expect(atStarts[0]).toBe('1');
    expect(none).toEqual([]);
  });

  it('writes the tempo rounded without its decimals, in the tempo font', () => {
    // Arrange
    const song = { ...plainBars(1), measureHeaders: [header(1, { tempo: 92.5 })] };
    const font = { family: 'Georgia', size: 14, isBold: false, isItalic: true };

    // Act
    const tempo = texts(engraved(styled(song, { ...notation({ showsTempoDecimals: false }), texts: { ...DEFAULT_STYLESHEET.texts, tempo: font } }))).find((text) => text.text.startsWith('♩'));

    // Assert
    expect(tempo).toMatchObject({ text: '♩ = 93', family: 'Georgia', italic: true, bold: false, size: 14 });
  });
});

describe('musical symbols', () => {
  it('writes palm mutes and let ring with the stylesheet’s labels, the line over the rests between them when asked', () => {
    // Arrange: palm-muted notes, a rest, a palm-muted note
    const song = makeSong([bar(0, (b) => (b === 2 ? [] : [note(1, 3, { palmMute: true })]))]);
    const renamed = styled(song, notation({ labels: { ...DEFAULT_STYLESHEET.notation.labels, palmMute: 'PM' } }));
    const bridged = styled(song, notation({ showsLinesOverRests: true }));

    // Act
    const labels = textValues(engraved(renamed));
    const count = (commands: DrawCommand[]) => textValues(commands).filter((text) => text === 'P.M.').length;

    // Assert
    expect(labels.filter((text) => text === 'PM')).toHaveLength(2);
    expect(labels).not.toContain('P.M.');
    expect(count(engraved(song))).toBe(2);
    expect(count(engraved(bridged))).toBe(1);
  });

  it('leaves the H and P off hammer-ons and pull-offs, and writes sl. over slides, when asked', () => {
    // Arrange
    const song = makeSong([bar(0, (b) => [note(1, b + 2, b === 0 ? { hammer: true } : b === 2 ? { slides: ['shift'] } : {})])]);

    // Act
    const plain = textValues(engraved(song));
    const changed = textValues(engraved(styled(song, notation({ showsHopoLabels: false, showsSlideLabels: true }))));

    // Assert
    expect(plain).toContain('H');
    expect(plain).not.toContain('sl.');
    expect(changed).not.toContain('H');
    expect(changed).toContain('sl.');
  });

  it('draws voice 2’s frets in ink when the voices are not coloured', () => {
    // Arrange
    const song = makeSong([bar(0, () => [])]);
    const withSecondVoice: Song = {
      ...song,
      tracks: song.tracks.map((track) => ({
        ...track,
        measures: track.measures.map((measure) => ({
          ...measure,
          beats: measure.beats.map((each) => ({ ...each, voices: [{ ...each.voices[0]!, isEmpty: true }, { ...each.voices[0]!, notes: [note(2, 7)] }] })),
        })),
      })),
    };
    const fret = (commands: DrawCommand[]) => texts(commands).find((text) => text.text === '7');

    // Act / Assert
    expect(fret(engraved(withSecondVoice))?.color).not.toBe(PALETTE.text);
    expect(fret(engraved(styled(withSecondVoice, notation({ showsVoiceColors: false }))))?.color).toBe(PALETTE.text);
  });

  it('writes 4/4 as C on the notation staff when asked', () => {
    const song = plainBars(1);
    const common = textValues(engraved(styled(song, notation({ showsCommonTime: true })), 'notation'));
    expect(common).toContain('');
    expect(textValues(engraved(song, 'notation'))).not.toContain('');
  });

  it('draws the beats’ free texts above the staves in the free text font', () => {
    // Arrange
    const song = makeSong([bar(0, (b) => [note(1, b)]).map((each, b) => (b === 1 ? { ...each, text: 'Verse' } : each))]);
    const font = { family: 'Courier', size: 12, isBold: true, isItalic: false };

    // Act
    const plain = texts(engraved(song)).find((text) => text.text === 'Verse');
    const styledText = texts(engraved(styled(song, { texts: { ...DEFAULT_STYLESHEET.texts, freeText: font } }))).find((text) => text.text === 'Verse');

    // Assert
    expect(plain).toMatchObject({ italic: true, size: 10, align: 'left' });
    expect(styledText).toMatchObject({ family: 'Courier', size: 12, bold: true });
    expect(styledText?.italic).toBeUndefined();
  });
});

describe('the PDF and the header follow the stylesheet', () => {
  const song: Song = { ...plainBars(8), info: { ...EMPTY_SONG_INFO, title: 'Etude', words: 'Anon', music: 'Carulli', copyright: '© 2026' } };

  it('prints on the stylesheet’s page, inside its margins, without page numbers when asked', () => {
    // Arrange
    const page = { ...DEFAULT_STYLESHEET.page, format: 'letter' as const, orientation: 'landscape' as const, margins: { top: 20, right: 10, bottom: 10, left: 30 } };
    const withoutNumbers = { ...DEFAULT_STYLESHEET.header, showsPageNumbers: false };

    // Act
    const pdf = buildPdfDocument(styled(song, { page, header: withoutNumbers }), 0, 'tab', { fileName: 'etude.gp' });
    const first = pdf.pages[0]!;

    // Assert
    expect([first.width, first.height]).toEqual([792, 612]);
    expect(textValues(first.commands).some((text) => text.includes(' / '))).toBe(false);
    const xs = texts(first.commands).map((text) => text.x);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(30 * (72 / 25.4) - 0.01);
  });

  it('prints the staves larger with a larger scale, so on more pages', () => {
    const long = { ...song, ...plainBars(40) };
    expect(buildPdfDocument(styled(long, { scale: 1.6 }), 0, 'notationAndTab', {}).pages.length).toBeGreaterThan(buildPdfDocument(long, 0, 'notationAndTab', {}).pages.length);
  });

  it('shows the song information the header shows, the credits each in their font', () => {
    // Arrange
    const shown = { ...DEFAULT_STYLESHEET.header, shown: { ...DEFAULT_STYLESHEET.header.shown, title: false, copyright: true } };
    const words = { family: 'Georgia', size: 14, isBold: false, isItalic: true };
    const sheet = styled(song, { header: shown, texts: { ...DEFAULT_STYLESHEET.texts, words } });

    // Act
    const lines = titleBlockLines(sheet, 0, 'Etude').map((line) => line.text);
    const credits = texts(engraveTitleBlock(sheet, 0, 'Etude', 500, PALETTE).commands).filter((text: TextCommand) => text.text.includes(':'));

    // Assert
    expect(lines).toEqual(['Music: Carulli  ·  Words: Anon', '© 2026', 'Guitar — Guitar · 6 strings · Standard (E A D G B E)']);
    expect(credits.map((text) => text.text)).toEqual(['Music: Carulli  ·  ', 'Words: Anon']);
    expect(credits[1]).toMatchObject({ family: 'Georgia', italic: true });
    expect(credits[0]!.x).toBeLessThan(credits[1]!.x);
  });
});
