import { describe, expect, it } from 'vitest';
import { isDefaultStylesheet, pageSize, setStylesheet, stylesheetOf } from '../src/edit/stylesheet';
import { DEFAULT_STYLESHEET, type Stylesheet } from '../src/model/stylesheet';
import type { Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

function song(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]]] }));
}

describe('stylesheetOf', () => {
  it('is the default stylesheet for a song without one', () => {
    expect(stylesheetOf(song())).toBe(DEFAULT_STYLESHEET);
  });
});

describe('isDefaultStylesheet', () => {
  it('knows the default stylesheet and a copy of it', () => {
    expect(isDefaultStylesheet(DEFAULT_STYLESHEET)).toBe(true);
    expect(isDefaultStylesheet(JSON.parse(JSON.stringify(DEFAULT_STYLESHEET)) as Stylesheet)).toBe(true);
  });

  it('knows a stylesheet with one value changed', () => {
    expect(isDefaultStylesheet({ ...DEFAULT_STYLESHEET, barNumbers: 'hidden' })).toBe(false);
    expect(isDefaultStylesheet({ ...DEFAULT_STYLESHEET, texts: { ...DEFAULT_STYLESHEET.texts, tempo: { ...DEFAULT_STYLESHEET.texts.tempo, isItalic: true } } })).toBe(false);
  });
});

describe('setStylesheet', () => {
  it('gives the song its stylesheet and leaves the rest alone', () => {
    // Arrange
    const original = song();
    const sheet: Stylesheet = { ...DEFAULT_STYLESHEET, scale: 1.5 };

    // Act
    const edited = setStylesheet(original, sheet);

    // Assert
    expect(edited.stylesheet).toEqual(sheet);
    expect(edited.tracks).toBe(original.tracks);
    expect(edited.measureHeaders).toBe(original.measureHeaders);
    expect(original.stylesheet).toBeUndefined();
  });

  it('clamps what is out of range', () => {
    const edited = setStylesheet(song(), { ...DEFAULT_STYLESHEET, scale: 9, systems: { ...DEFAULT_STYLESHEET.systems, barsPerSystem: -3 } });
    expect(edited.stylesheet?.scale).toBe(2);
    expect(edited.stylesheet?.systems.barsPerSystem).toBe(0);
  });

  it('keeps no stylesheet when it is the default one', () => {
    // Arrange
    const styled = setStylesheet(song(), { ...DEFAULT_STYLESHEET, scale: 1.5 });

    // Act
    const reset = setStylesheet(styled, DEFAULT_STYLESHEET);

    // Assert
    expect(reset).not.toHaveProperty('stylesheet');
  });

  it('returns the same song when nothing changes', () => {
    const original = song();
    expect(setStylesheet(original, DEFAULT_STYLESHEET)).toBe(original);
    const styled = setStylesheet(original, { ...DEFAULT_STYLESHEET, lyrics: 'above' });
    expect(setStylesheet(styled, { ...DEFAULT_STYLESHEET, lyrics: 'above' })).toBe(styled);
  });
});

describe('pageSize', () => {
  it('is the format in points, turned for landscape', () => {
    expect(pageSize(DEFAULT_STYLESHEET.page)).toEqual({ width: 595, height: 842 });
    expect(pageSize({ ...DEFAULT_STYLESHEET.page, format: 'letter', orientation: 'landscape' })).toEqual({ width: 792, height: 612 });
  });

  it('is a custom size in points, from millimetres', () => {
    expect(pageSize({ ...DEFAULT_STYLESHEET.page, format: 'custom', customWidth: 254, customHeight: 127 })).toEqual({ width: 720, height: 360 });
  });
});
