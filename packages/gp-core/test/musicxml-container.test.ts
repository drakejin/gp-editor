import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src/errors';
import { detectFormat } from '../src/formats/detect';
import { readSong } from '../src/read-song';
import { encodeMusicXml } from '../src/write/musicxml/musicxml-archive';
import { loadFixture } from './helpers/fixtures';
import { DIVISIONS_1, firstTrack, onePart, quarter } from './helpers/musicxml-snippets';

const SCORE = onePart(DIVISIONS_1 + quarter('E4'));

function container(fullPath: string): string {
  return `<?xml version="1.0"?><container><rootfiles><rootfile full-path="${fullPath}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`;
}

describe('detectFormat for MusicXML', () => {
  it('detects score-partwise and score-timewise text after a byte order mark, declaration, comments and doctype', () => {
    // Arrange
    const prolog = '﻿<?xml version="1.0" encoding="UTF-8"?>\n<!-- a long comment -->\n<!DOCTYPE score-partwise PUBLIC "x" "y">\n';

    // Act / Assert
    expect(detectFormat(encodeMusicXml(`${prolog}<score-partwise version="3.1">`))).toEqual({ format: 'musicxml', version: '' });
    expect(detectFormat(encodeMusicXml('  <score-timewise>'))?.format).toBe('musicxml');
  });

  it('does not take other XML or text for MusicXML', () => {
    // Arrange / Act / Assert
    expect(detectFormat(encodeMusicXml('<?xml version="1.0"?><GPIF/>'))).toBeUndefined();
    expect(detectFormat(encodeMusicXml('hello <score-partwise>'))).toBeUndefined();
  });

  it('detects a zip holding META-INF/container.xml as compressed MusicXML and keeps Guitar Pro 7 archives', () => {
    // Arrange
    const mxl = zipSync({ 'META-INF/container.xml': encodeMusicXml(container('score.xml')), 'score.xml': encodeMusicXml(SCORE) });

    // Act / Assert
    expect(detectFormat(mxl)?.format).toBe('musicxml');
    expect(detectFormat(loadFixture('guitarpro7', 'bends.gp'))?.format).toBe('gp7');
  });
});

describe('reading compressed MusicXML', () => {
  it('reads the score container.xml names', () => {
    // Arrange
    const mxl = zipSync({
      mimetype: encodeMusicXml('application/vnd.recordare.musicxml'),
      'META-INF/container.xml': encodeMusicXml(container('music/song.musicxml')),
      'music/song.musicxml': encodeMusicXml(SCORE),
      'other.xml': encodeMusicXml('<not-a-score/>'),
    });

    // Act
    const song = readSong(mxl);

    // Assert
    expect(firstTrack(song).name).toBe('Guitar');
  });

  it('falls back to the first MusicXML entry when container.xml names none', () => {
    // Arrange
    const mxl = zipSync({ 'META-INF/container.xml': encodeMusicXml('<container/>'), 'score.xml': encodeMusicXml(SCORE) });

    // Act
    const song = readSong(mxl);

    // Assert
    expect(song.tracks).toHaveLength(1);
  });

  it('refuses an archive whose score is missing', () => {
    // Arrange
    const mxl = zipSync({ 'META-INF/container.xml': encodeMusicXml(container('missing.xml')) });

    // Act / Assert
    expect(() => readSong(mxl)).toThrow(GpFormatError);
  });
});
