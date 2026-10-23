import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/formats/detect';
import { UnsupportedFormatError, readSong } from '../src/index';
import { listFixtures, loadFixture } from './helpers/fixtures';

function gtpHeader(version: string): Uint8Array {
  const bytes = new Uint8Array(31);
  bytes[0] = version.length;
  bytes.set(new TextEncoder().encode(version), 1);
  return bytes;
}

describe('detectFormat', () => {
  it.each([
    ['FICHIER GUITARE PRO v1', 'gp1'],
    ['FICHIER GUITARE PRO v1.04', 'gp1'],
    ['FICHIER GUITAR PRO v2.21', 'gp2'],
    ['FICHIER GUITAR PRO v3.00', 'gp3'],
    ['FICHIER GUITAR PRO L4.06', 'gp4'],
    ['FICHIER GUITAR PRO v5.10', 'gp5'],
  ])('detects %s as %s', (version, format) => {
    expect(detectFormat(gtpHeader(version))).toEqual({ format, version });
  });

  it('detects zip containers as gp7 and BCFZ/BCFS as gpx', () => {
    expect(detectFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))?.format).toBe('gp7');
    expect(detectFormat(new TextEncoder().encode('BCFZ....'))).toEqual({ format: 'gpx', version: 'BCFZ' });
    expect(detectFormat(new TextEncoder().encode('BCFS....'))).toEqual({ format: 'gpx', version: 'BCFS' });
  });

  it('detects a Standard MIDI File by its MThd chunk', () => {
    expect(detectFormat(new TextEncoder().encode('MThd\0\0\0\x06'))).toEqual({ format: 'midi', version: '' });
    expect(detectFormat(new TextEncoder().encode('MTrk\0\0\0\x06'))).toBeUndefined();
  });

  it('returns undefined for unknown or too-short input', () => {
    expect(detectFormat(new Uint8Array())).toBeUndefined();
    expect(detectFormat(gtpHeader('FICHIER GUITAR PRO v9.99'))).toBeUndefined();
    expect(detectFormat(new TextEncoder().encode('hello'))).toBeUndefined();
  });

  it.each([
    ['guitarpro3', 'gp3'],
    ['guitarpro4', 'gp4'],
    ['guitarpro5', 'gp5'],
    ['guitarpro6', 'gpx'],
    ['guitarpro7', 'gp7'],
    ['guitarpro8', 'gp7'],
  ] as const)('detects every %s fixture as %s', (folder, format) => {
    const names = listFixtures(folder);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(detectFormat(loadFixture(folder, name))?.format, name).toBe(format);
    }
  });
});

describe('readSong', () => {
  it('rejects non Guitar Pro input', () => {
    expect(() => readSong(new TextEncoder().encode('not a guitar pro file at all, sorry'))).toThrow(
      UnsupportedFormatError,
    );
  });

  it('accepts an ArrayBuffer', () => {
    expect(() => readSong(new ArrayBuffer(4))).toThrow(UnsupportedFormatError);
  });
});
