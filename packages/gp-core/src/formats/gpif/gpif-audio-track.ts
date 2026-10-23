// Guitar Pro 7/8's audio track in GPIF (no TuxGuitar counterpart: TuxGuitar ignores it): `<BackingTrack>`, its
// `<Assets>` entry and the master track's SyncPoint automations, read into the model's AudioTrack.
import { buildAudioTrack, fileExtensionOf } from '../../audio-track/audio-track';
import type { AudioSyncPoint, AudioTrack } from '../../model/song';
import { type XmlElement, attribute, child, childList, childText, parseFloatOr, parseJavaInt } from './xml';

/** Guitar Pro counts the audio in frames of 44.1 kHz, whatever the file's own rate (FrameOffset, FramePadding). */
export const GP_AUDIO_FRAME_RATE = 44100;
/** The channel strip parameter Guitar Pro keeps the volume in (0–1), as for its tracks. */
export const GP_STRIP_VOLUME = 12;
const CENTS_PER_SEMITONE = 100;

/** The audio track as the GPIF document holds it. */
export interface GpifAudioTrack {
  readonly name: string;
  readonly playbackState: string | undefined;
  readonly volume: number | undefined;
  readonly isEnabled: boolean;
  readonly source: string | undefined;
  readonly assetId: string | undefined;
  readonly framePadding: number;
  readonly semitones: number;
  readonly cents: number;
  readonly asset: GpifAsset | undefined;
  readonly syncPoints: readonly GpifSyncPoint[];
}

export interface GpifAsset {
  readonly originalFilePath: string;
  readonly originalFileSha1: string;
  /** Where the audio file is in the .gp archive, e.g. "Content/Assets/<sha1>.ogg". */
  readonly embeddedFilePath: string;
}

export interface GpifSyncPoint {
  readonly barIndex: number;
  readonly occurrence: number;
  readonly position: number;
  readonly frameOffset: number;
}

function readAsset(root: XmlElement, assetId: string | undefined): GpifAsset | undefined {
  const asset = childList(root, 'Assets', 'Asset').find((candidate) => attribute(candidate, 'id') === assetId);
  const embeddedFilePath = childText(asset, 'EmbeddedFilePath')?.trim() ?? '';
  if (asset === undefined || embeddedFilePath === '') {
    return undefined;
  }
  return {
    originalFilePath: childText(asset, 'OriginalFilePath') ?? '',
    originalFileSha1: childText(asset, 'OriginalFileSha1')?.trim() ?? '',
    embeddedFilePath,
  };
}

function readSyncPoint(node: XmlElement): GpifSyncPoint {
  const value = child(node, 'Value');
  return {
    barIndex: parseJavaInt(childText(value, 'BarIndex') ?? childText(node, 'Bar'), -1),
    occurrence: parseJavaInt(childText(value, 'BarOccurrence'), 0),
    position: parseFloatOr(childText(node, 'Position'), 0),
    frameOffset: parseFloatOr(childText(value, 'FrameOffset'), Number.NaN),
  };
}

function stripVolume(node: XmlElement | undefined): number | undefined {
  const parameters = (childText(child(node, 'ChannelStrip'), 'Parameters') ?? '').trim().split(/\s+/);
  const value = parseFloatOr(parameters[GP_STRIP_VOLUME], Number.NaN);
  return Number.isNaN(value) ? undefined : value;
}

/** The document's `<BackingTrack>` with its asset and sync points; undefined when it has none. */
export function readGpifAudioTrack(root: XmlElement): GpifAudioTrack | undefined {
  const node = child(root, 'BackingTrack');
  if (node === undefined) {
    return undefined;
  }
  const assetId = childText(node, 'AssetId')?.trim();
  const automations = childList(child(root, 'MasterTrack'), 'Automations', 'Automation');
  return {
    name: childText(node, 'Name') ?? '',
    playbackState: childText(node, 'PlaybackState')?.trim(),
    volume: stripVolume(node),
    isEnabled: childText(node, 'Enabled')?.trim() === 'true',
    source: childText(node, 'Source')?.trim(),
    assetId,
    framePadding: parseFloatOr(childText(node, 'FramePadding'), 0),
    semitones: parseJavaInt(childText(node, 'Semitones'), 0),
    cents: parseJavaInt(childText(node, 'Cents'), 0),
    asset: readAsset(root, assetId),
    syncPoints: automations.filter((automation) => childText(automation, 'Type') === 'SyncPoint').map(readSyncPoint),
  };
}

/** The file name of an archive path without its extension ("Content/Assets/take.mp3" → "take"). */
function baseName(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.slice(0, dot);
}

function toSyncPoint(point: GpifSyncPoint, framePadding: number): AudioSyncPoint {
  return {
    measureIndex: point.barIndex,
    occurrence: point.occurrence,
    position: point.position,
    seconds: (point.frameOffset - framePadding) / GP_AUDIO_FRAME_RATE,
  };
}

/**
 * The model's audio track: Guitar Pro plays only an enabled track of a local file (a YouTube video is not audio data
 * the file holds), so anything else, or a track whose asset is missing, is no audio track.
 */
export function buildGpifAudioTrack(gpif: GpifAudioTrack | undefined): AudioTrack | undefined {
  const asset = gpif?.asset;
  if (gpif === undefined || asset === undefined || !gpif.isEnabled || gpif.source !== 'Local') {
    return undefined;
  }
  const assetId = asset.originalFileSha1 !== '' ? asset.originalFileSha1 : baseName(asset.embeddedFilePath);
  if (assetId.trim() === '') {
    return undefined;
  }
  return buildAudioTrack({
    assetId,
    fileExtension: fileExtensionOf(asset.embeddedFilePath) || fileExtensionOf(asset.originalFilePath),
    originalFilePath: asset.originalFilePath,
    name: gpif.name,
    volume: gpif.volume,
    mute: gpif.playbackState === 'Mute',
    solo: gpif.playbackState === 'Solo',
    detuneCents: gpif.semitones * CENTS_PER_SEMITONE + gpif.cents,
    startSeconds: gpif.framePadding === 0 ? 0 : -gpif.framePadding / GP_AUDIO_FRAME_RATE,
    syncPoints: gpif.syncPoints.map((point) => toSyncPoint(point, gpif.framePadding)),
  });
}
