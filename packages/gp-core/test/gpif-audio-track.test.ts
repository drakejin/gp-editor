/**
 * Guitar Pro 7/8's audio track (backing track) in GPIF: read from canon-audio-track.gp (Guitar Pro 8.1.3) and from small
 * hand-written documents, written back as Guitar Pro writes it, and the audio file carried through a .gp round trip.
 */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildAudioTrack } from '../src/audio-track/audio-track';
import { GP_AUDIO_FRAME_RATE } from '../src/formats/gpif/gpif-audio-track';
import { readGpifDocument } from '../src/formats/gpif/gpif-reader';
import { gpifToSong } from '../src/formats/gpif/gpif-to-song';
import { decodeUtf8Lenient } from '../src/io/text';
import type { Song } from '../src/model/song';
import { readSong, readSongFile } from '../src/read-song';
import { writeSong } from '../src/write/index';
import { loadFixture } from './helpers/fixtures';

const CANON = loadFixture('guitarpro8', 'canon-audio-track.gp');
const CANON_ASSET = 'Content/Assets/1ac79e61-7ff6-58af-b7d0-f2d6cf2eb831.ogg';
/** Guitar Pro's frame padding in the fixture: the score starts 72900 frames into the audio. */
const PADDING = 72900;

/** Writing and reading the 224-bar, 9-track fixture back takes a few seconds. */
const SLOW_TEST_TIMEOUT = 30000;

function fixtureGpif(): string {
  return decodeUtf8Lenient(unzipSync(CANON, { filter: (file) => file.name === 'Content/score.gpif' })['Content/score.gpif'] ?? new Uint8Array());
}

/** The numbers of every element of that name, in document order. */
function valuesOf(gpif: string, element: string): number[] {
  return [...gpif.matchAll(new RegExp(`<${element}>([^<]*)</${element}>`, 'g'))].map((match) => Number(match[1]));
}

/** Byte by byte (a deep equality of a megabyte of audio takes vitest many seconds). */
function isSameBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  return a !== undefined && b !== undefined && a.length === b.length && a.every((byte, index) => byte === b[index]);
}

function seconds(frames: number): number {
  return frames / GP_AUDIO_FRAME_RATE;
}

const TRACKS = '<Tracks><Track id="0"><Name>Guitar</Name></Track></Tracks>';
const BARS = '<MasterBars><MasterBar><Time>4/4</Time><Bars>0</Bars></MasterBar><MasterBar><Time>4/4</Time><Bars>1</Bars></MasterBar></MasterBars>'
  + '<Bars><Bar id="0"><Voices>-1 -1 -1 -1</Voices></Bar><Bar id="1"><Voices>-1 -1 -1 -1</Voices></Bar></Bars>';

function backingTrack(fields: Readonly<Record<string, string>> = {}): string {
  const values: Readonly<Record<string, string>> = {
    Name: '<![CDATA[Band]]>',
    PlaybackState: 'Default',
    Enabled: 'true',
    Source: 'Local',
    AssetId: '3',
    FramePadding: '-44100',
    Semitones: '0',
    Cents: '0',
    ...fields,
  };
  const elements = Object.entries(values).map(([name, value]) => `<${name}>${value}</${name}>`).join('');
  return `<BackingTrack>${elements}<ChannelStrip><Parameters>0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5 0 0.5 0.5 0.4 0.5 0.5 0.5</Parameters></ChannelStrip></BackingTrack>`;
}

const ASSET = '<Assets><Asset id="3"><OriginalFilePath><![CDATA[/Users/me/take.MP3]]></OriginalFilePath>'
  + '<EmbeddedFilePath><![CDATA[Content/Assets/take-1.mp3]]></EmbeddedFilePath></Asset></Assets>';

function syncPoint(bar: number, position: number, frameOffset: number, occurrence = 0): string {
  return `<Automation><Type>SyncPoint</Type><Linear>false</Linear><Bar>${bar}</Bar><Position>${position}</Position><Visible>true</Visible>`
    + `<Value><BarIndex>${bar}</BarIndex><BarOccurrence>${occurrence}</BarOccurrence><ModifiedTempo>120</ModifiedTempo>`
    + `<OriginalTempo>120</OriginalTempo><FrameOffset>${frameOffset}</FrameOffset></Value></Automation>`;
}

function songOf(backing: string, assets = ASSET, automations = ''): Song {
  const xml = `<GPIF><MasterTrack><Automations>${automations}</Automations></MasterTrack>${backing}${TRACKS}${BARS}${assets}</GPIF>`;
  return gpifToSong(readGpifDocument(xml, 7), { format: 'gp7', version: 'test' });
}

describe('reading the audio track of canon-audio-track.gp', () => {
  it('reads the track, its asset and Guitar Pro’s mixer settings', () => {
    // Arrange / Act
    const { audioTrack } = readSong(CANON);

    // Assert
    expect(audioTrack).toMatchObject({
      assetId: '1ac79e61-7ff6-58af-b7d0-f2d6cf2eb831',
      fileExtension: 'ogg',
      originalFilePath: 'C:/Users/Daniel/Downloads/Canon Rock (JerryC) - The Original/Canon Rock (JerryC) - The Original (128kbit_AAC).ogg',
      name: 'Audio Track',
      volume: 0.8,
      mute: false,
      solo: false,
      detuneCents: 0,
      startSeconds: seconds(PADDING),
    });
  }, SLOW_TEST_TIMEOUT);

  it('reads the sixteen sync points in seconds of the audio (frame offset less the padding, 44.1 kHz frames)', () => {
    // Arrange / Act
    const points = readSong(CANON).audioTrack?.syncPoints ?? [];

    // Assert
    expect(points).toHaveLength(16);
    expect(points[0]).toEqual({ measureIndex: 0, occurrence: 0, position: 0, seconds: seconds(PADDING) });
    expect(points[1]).toEqual({ measureIndex: 0, occurrence: 0, position: 0.5, seconds: seconds(73620 + PADDING) });
    expect(points[15]).toEqual({ measureIndex: 223, occurrence: 0, position: 1, seconds: seconds(14155776 + PADDING) });
  }, SLOW_TEST_TIMEOUT);

  it('returns the audio file’s bytes with the song', () => {
    // Arrange / Act
    const { song, audioTrackData } = readSongFile(CANON);

    // Assert
    expect(song.audioTrack?.assetId).toBe('1ac79e61-7ff6-58af-b7d0-f2d6cf2eb831');
    expect(isSameBytes(audioTrackData, unzipSync(CANON, { filter: (file) => file.name === CANON_ASSET })[CANON_ASSET])).toBe(true);
    expect(decodeUtf8Lenient(audioTrackData?.subarray(0, 4) ?? new Uint8Array())).toBe('OggS');
  }, SLOW_TEST_TIMEOUT);

  it('gives no audio data for a file without an audio track, or of another format', () => {
    // Arrange / Act
    const gp = readSongFile(loadFixture('guitarpro8', 'slash.gp'));
    const gp5 = readSongFile(loadFixture('guitarpro5', 'bends.gp5'));

    // Assert
    expect(gp.song.audioTrack).toBeUndefined();
    expect(gp.audioTrackData).toBeUndefined();
    expect(gp5.audioTrackData).toBeUndefined();
  });
});

describe('reading GPIF audio tracks', () => {
  it('takes the volume from the channel strip, mute and solo from the playback state, the detune from semitones and cents', () => {
    // Arrange / Act
    const muted = songOf(backingTrack({ PlaybackState: 'Mute', Semitones: '-2', Cents: '-30' })).audioTrack;
    const solo = songOf(backingTrack({ PlaybackState: 'Solo' })).audioTrack;

    // Assert
    expect(muted).toMatchObject({ name: 'Band', volume: 0.4, mute: true, solo: false, detuneCents: -230, startSeconds: 1 });
    expect(solo).toMatchObject({ mute: false, solo: true });
  });

  it('names the asset after its embedded file when Guitar Pro gives no SHA-1', () => {
    // Arrange / Act
    const track = songOf(backingTrack()).audioTrack;

    // Assert
    expect(track).toMatchObject({ assetId: 'take-1', fileExtension: 'mp3', originalFilePath: '/Users/me/take.MP3' });
  });

  it('reads sync points with their bar occurrence and leaves out those before the audio starts', () => {
    // Arrange
    const automations = syncPoint(0, 0, -88200) + syncPoint(0, 0.25, 0) + syncPoint(1, 0, 44100, 1);

    // Act
    const points = songOf(backingTrack(), ASSET, automations).audioTrack?.syncPoints;

    // Assert
    expect(points).toEqual([
      { measureIndex: 0, occurrence: 0, position: 0.25, seconds: 1 },
      { measureIndex: 1, occurrence: 1, position: 0, seconds: 2 },
    ]);
  });

  it('has no audio track when it is disabled, comes from YouTube or names no asset', () => {
    // Arrange / Act / Assert
    expect(songOf(backingTrack({ Enabled: 'false' })).audioTrack).toBeUndefined();
    expect(songOf(backingTrack({ Source: 'YouTube' })).audioTrack).toBeUndefined();
    expect(songOf(backingTrack({ AssetId: '9' })).audioTrack).toBeUndefined();
    expect(songOf(backingTrack(), '').audioTrack).toBeUndefined();
    expect(songOf('').audioTrack).toBeUndefined();
  });
});

describe('writing the audio track', () => {
  function written(song: Song, audioTrackData?: Uint8Array): { readonly gpif: string; readonly entries: Readonly<Record<string, Uint8Array>> } {
    const entries = unzipSync(writeSong(song, 'gp', { audioTrackData }));
    return { gpif: decodeUtf8Lenient(entries['Content/score.gpif'] ?? new Uint8Array()), entries };
  }

  it('writes Guitar Pro’s modified tempos: quarter notes per minute of the audio to the next point', () => {
    // Arrange
    const { song, audioTrackData } = readSongFile(CANON);

    // Act
    const ours = valuesOf(written(song, audioTrackData).gpif, 'ModifiedTempo');

    // Assert: Guitar Pro keeps single-precision floats; its point at bar 1, beat 3 sits a hair off half the bar
    const theirs = valuesOf(fixtureGpif(), 'ModifiedTempo');
    expect(ours).toHaveLength(16);
    ours.forEach((tempo, index) => expect(tempo).toBeCloseTo(theirs[index] ?? 0, 2));
  }, SLOW_TEST_TIMEOUT);

  it('round-trips canon-audio-track.gp’s audio track and audio file', () => {
    // Arrange
    const { song, audioTrackData } = readSongFile(CANON);

    // Act
    const again = readSongFile(writeSong(song, 'gp', { audioTrackData }));

    // Assert
    expect(again.song.audioTrack).toEqual(song.audioTrack);
    expect(isSameBytes(again.audioTrackData, audioTrackData)).toBe(true);
  }, SLOW_TEST_TIMEOUT);

  it('writes the elements Guitar Pro writes, with its frame offsets and tempos', () => {
    // Arrange
    const { song, audioTrackData } = readSongFile(CANON);

    // Act
    const { gpif, entries } = written(song, audioTrackData);

    // Assert
    expect(gpif).toMatch(/<\/MasterTrack>\n<BackingTrack>\n<IconId>21<\/IconId>\n<Color>0 0 0<\/Color>\n<Name><!\[CDATA\[Audio Track\]\]><\/Name>/);
    expect(gpif).toContain('<FramePadding>-72900</FramePadding>\n<Semitones>0</Semitones>\n<Cents>0</Cents>\n</BackingTrack>');
    expect(gpif).toMatch(/<Value>\n<BarIndex>0<\/BarIndex>\n<BarOccurrence>0<\/BarOccurrence>\n<ModifiedTempo>[\d.]+<\/ModifiedTempo>\n<OriginalTempo>90<\/OriginalTempo>\n<FrameOffset>0<\/FrameOffset>\n<\/Value>/);
    expect(valuesOf(gpif, 'FrameOffset')).toEqual(valuesOf(fixtureGpif(), 'FrameOffset'));
    expect(gpif).toMatch(/<\/Rhythms>\n<Assets>\n<Asset id="0">\n<OriginalFilePath><!\[CDATA\[C:\/Users\/Daniel/);
    expect(gpif).toContain(`<EmbeddedFilePath><![CDATA[${CANON_ASSET}]]></EmbeddedFilePath>`);
    expect(isSameBytes(entries[CANON_ASSET], audioTrackData)).toBe(true);
    expect(decodeUtf8Lenient(entries['meta.json'] ?? new Uint8Array())).toContain('"hasAudio": true');
  }, SLOW_TEST_TIMEOUT);

  it('writes mute, solo (solo first), volume and detune as Guitar Pro keeps them', () => {
    // Arrange
    const base = readSong(loadFixture('guitarpro8', 'slash.gp'));
    const song: Song = { ...base, audioTrack: buildAudioTrack({ assetId: 'abc', fileExtension: 'wav', volume: 0.25, mute: true, solo: true, detuneCents: -250 }) };

    // Act
    const { gpif, entries } = written(song, new Uint8Array([1, 2, 3]));
    const again = readSongFile(writeSong(song, 'gp', { audioTrackData: new Uint8Array([1, 2, 3]) })).song.audioTrack;

    // Assert
    expect(gpif).toContain('<PlaybackState>Solo</PlaybackState>');
    expect(gpif).toContain('0.250000 0.500000 0.500000 0.500000</Parameters>');
    expect(gpif).toContain('<Semitones>-2</Semitones>\n<Cents>-50</Cents>');
    expect(entries['Content/Assets/abc.wav']).toEqual(new Uint8Array([1, 2, 3]));
    expect(again).toMatchObject({ volume: 0.25, mute: false, solo: true, detuneCents: -250 });
  });

  it('leaves the audio track out when its audio data is not given', () => {
    // Arrange
    const song = readSong(CANON);

    // Act
    const { gpif, entries } = written(song);

    // Assert
    expect(gpif).not.toContain('<BackingTrack>');
    expect(gpif).not.toContain('<Assets>');
    expect(gpif).not.toContain('SyncPoint');
    expect(entries['meta.json']).toBeUndefined();
    expect(readSong(writeSong(song, 'gp')).audioTrack).toBeUndefined();
  }, SLOW_TEST_TIMEOUT);

  it('keeps an asset name that is safe as a file name inside the archive', () => {
    // Arrange
    const base = readSong(loadFixture('guitarpro8', 'slash.gp'));
    const song: Song = { ...base, audioTrack: buildAudioTrack({ assetId: '../../evil name', fileExtension: 'mp3' }) };

    // Act
    const { entries } = written(song, new Uint8Array([7]));

    // Assert
    expect(Object.keys(entries).filter((name) => name.startsWith('Content/Assets/'))).toEqual(['Content/Assets/.._.._evil_name.mp3']);
  });

  it('leaves the audio track out of GP5, GP4 and GP3 files', () => {
    // Arrange
    const { song, audioTrackData } = readSongFile(CANON);

    // Act / Assert
    for (const format of ['gp5', 'gp4', 'gp3'] as const) {
      expect(readSong(writeSong(song, format, { audioTrackData })).audioTrack).toBeUndefined();
    }
  }, SLOW_TEST_TIMEOUT);
});
