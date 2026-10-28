// Guitar Pro 7/8's audio track in GPIF (no TuxGuitar counterpart): `<BackingTrack>`, the `<Assets>` entry and the
// master track's SyncPoint automations, written as Guitar Pro 8 writes them — the inverse of formats/gpif/gpif-audio-track.ts.
import { buildSyncMap } from '../../audio-track/sync-map';
import { GP7_ASSETS_FOLDER } from '../../formats/gpif/container-gp7';
import { GP_AUDIO_FRAME_RATE, GP_STRIP_VOLUME } from '../../formats/gpif/gpif-audio-track';
import { type AudioSyncPoint, type AudioTrack, QUARTER_TIME, type Song } from '../../model/song';
import { type XmlNode, xmlCdata, xmlElement, xmlText } from './xml-writer';

/** The asset id the backing track and its `<Asset>` share (Guitar Pro numbers its assets from 0). */
const ASSET_ID = 0;
/** Guitar Pro's audio track icon, colour, short name, waveform filter and zoom. */
const ICON_ID = 21;
const COLOR = '0 0 0';
const SHORT_NAME = 'a.track';
const FILTER = 6;
const FRAMES_PER_PIXEL = 400;
/** The backing track's channel strip as Guitar Pro writes it; the volume is parameter GP_STRIP_VOLUME. */
const CHANNEL_STRIP = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.8, 0.5, 0.5, 0.5] as const;
const CENTS_PER_SEMITONE = 100;
/** Significant digits of the tempos Guitar Pro keeps with a sync point (single-precision floats). */
const TEMPO_DIGITS = 8;
/** Characters an asset's file name keeps inside the archive; the others become "_". */
const UNSAFE_NAME_CHARACTERS = /[^A-Za-z0-9._-]/g;
const MAX_NAME_LENGTH = 100;

/** Where the audio file goes in the archive: Content/Assets/<asset id>.<extension>, a plain file name. */
export function audioAssetPath(track: AudioTrack): string {
  const name = track.assetId.replace(UNSAFE_NAME_CHARACTERS, '_').slice(0, MAX_NAME_LENGTH) || 'audio';
  return `${GP7_ASSETS_FOLDER}${name}${track.fileExtension === '' ? '' : `.${track.fileExtension}`}`;
}

function playbackStateOf(track: AudioTrack): string {
  if (track.solo) {
    return 'Solo';
  }
  return track.mute ? 'Mute' : 'Default';
}

/** Frames of 44.1 kHz the score's start lies before the audio's (negative: after it). */
function framePaddingOf(track: AudioTrack): number {
  return Math.round(-track.startSeconds * GP_AUDIO_FRAME_RATE) || 0;
}

/** `<BackingTrack>`: the audio track playing the asset of ASSET_ID. */
export function backingTrackNode(track: AudioTrack): XmlNode {
  const semitones = Math.trunc(track.detuneCents / CENTS_PER_SEMITONE);
  const strip = CHANNEL_STRIP.map((value, index) => (index === GP_STRIP_VOLUME ? track.volume : value).toFixed(6));
  return xmlElement('BackingTrack', [
    xmlText('IconId', ICON_ID),
    xmlText('Color', COLOR),
    xmlCdata('Name', track.name),
    xmlCdata('ShortName', SHORT_NAME),
    xmlText('PlaybackState', playbackStateOf(track)),
    xmlElement('ChannelStrip', [xmlText('Parameters', strip.join(' '))]),
    xmlText('Enabled', 'true'),
    xmlText('Source', 'Local'),
    xmlText('AssetId', ASSET_ID),
    xmlText('YouTubeVideoUrl', ''),
    xmlText('Filter', FILTER),
    xmlText('FramesPerPixel', FRAMES_PER_PIXEL),
    xmlText('FramePadding', framePaddingOf(track)),
    xmlText('Semitones', semitones),
    xmlText('Cents', track.detuneCents - semitones * CENTS_PER_SEMITONE || 0),
  ]);
}

/** `<Assets>`: the audio file, named by the asset id Guitar Pro reads back as OriginalFileSha1. */
export function assetsNode(track: AudioTrack): XmlNode {
  return xmlElement('Assets', [
    xmlElement(
      'Asset',
      [xmlCdata('OriginalFilePath', track.originalFilePath), xmlCdata('OriginalFileSha1', track.assetId), xmlCdata('EmbeddedFilePath', audioAssetPath(track))],
      { id: ASSET_ID },
    ),
  ]);
}

function formatTempo(tempo: number): string {
  return String(Number(tempo.toPrecision(TEMPO_DIGITS)));
}

const SECONDS_PER_MINUTE = 60;

/**
 * Guitar Pro's ModifiedTempo of each point: the quarter notes per minute from it to the next point in the audio's time
 * (the last point keeps the one before's); a point off the map, or alone, its bar's written tempo.
 */
function modifiedTempos(song: Song, points: readonly AudioSyncPoint[], fallback: number): readonly number[] {
  const { anchors } = buildSyncMap(song);
  const tempos = new Map<number, number>();
  anchors.forEach((anchor, index) => {
    const next = anchors[index + 1];
    const previous = tempos.get(anchors[index - 1]?.pointIndex ?? -1);
    if (next !== undefined) {
      tempos.set(anchor.pointIndex, ((next.tick - anchor.tick) / QUARTER_TIME) * (SECONDS_PER_MINUTE / (next.seconds - anchor.seconds)));
    } else if (previous !== undefined) {
      tempos.set(anchor.pointIndex, previous);
    }
  });
  return points.map((point, index) => tempos.get(index) ?? song.measureHeaders[point.measureIndex]?.tempo ?? fallback);
}

/** One SyncPoint automation of the master track. */
function syncPointNode(point: AudioSyncPoint, modifiedTempo: number, originalTempo: number, framePadding: number): XmlNode {
  return xmlElement('Automation', [
    xmlText('Type', 'SyncPoint'),
    xmlText('Linear', 'false'),
    xmlText('Bar', point.measureIndex),
    xmlText('Position', point.position),
    xmlText('Visible', 'true'),
    xmlElement('Value', [
      xmlText('BarIndex', point.measureIndex),
      xmlText('BarOccurrence', point.occurrence),
      xmlText('ModifiedTempo', formatTempo(modifiedTempo)),
      xmlText('OriginalTempo', formatTempo(originalTempo)),
      xmlText('FrameOffset', Math.round(point.seconds * GP_AUDIO_FRAME_RATE) + framePadding),
    ]),
  ]);
}

/** The master track's SyncPoint automations: frame offsets from the padded start, the tempos Guitar Pro keeps. */
export function syncPointNodes(song: Song, track: AudioTrack): readonly XmlNode[] {
  const originalTempo = song.measureHeaders[0]?.tempo ?? 0;
  const tempos = modifiedTempos(song, track.syncPoints, originalTempo);
  const framePadding = framePaddingOf(track);
  return track.syncPoints.map((point, index) => syncPointNode(point, tempos[index] ?? originalTempo, originalTempo, framePadding));
}
