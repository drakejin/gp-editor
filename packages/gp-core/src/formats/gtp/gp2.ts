// Port of TuxGuitar app.tuxguitar.io.gtp.GP2InputStream (LGPL-2.1).
import { UnsupportedFormatError } from '../../errors';
import type { ByteReader } from '../../io/byte-reader';
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';
import { type LegacyDialect, readLegacySong } from './legacy-shared';
import { velocityFromGp } from './shared';

const SUPPORTED_VERSIONS: ReadonlySet<string> = new Set(['FICHIER GUITAR PRO v2.20', 'FICHIER GUITAR PRO v2.21']);

const BEAT_STROKE = 0x01;
const BEAT_MIX_CHANGE = 0x02;
const MIX_TEMPO = 0x20;
/** Reverb, chorus, balance and volume: a value and a transition byte each. */
const MIX_TWO_BYTE_FIELDS = [0x10, 0x08, 0x04, 0x02] as const;
const MIX_INSTRUMENT = 0x01;

const GP2_DIALECT: LegacyDialect = {
  format: 'gp2',
  trackCount: 8,
  hasStringCount: true,
  hasTrackDetails: true,
  hasFullChords: true,
  hasGraceFlags: true,
  readBeatPrefix: readSecondBeatFlags,
  readVelocity: readDynamic,
};

/** Reads a Guitar Pro 2 file (v2.20, v2.21). */
export function readGp2(bytes: Uint8Array, detected: DetectedFormat, options: ResolvedReadOptions): Song {
  if (!SUPPORTED_VERSIONS.has(detected.version)) {
    throw new UnsupportedFormatError(`Unsupported Guitar Pro 2 version "${detected.version}"`);
  }
  return readLegacySong(bytes, detected, options, GP2_DIALECT);
}

/** Second flag byte of a beat: a mix change (tempo is kept) and a stroke (skipped, as in TuxGuitar). */
function readSecondBeatFlags(reader: ByteReader): number | undefined {
  const flags = reader.readUnsignedByte();
  const tempo = (flags & BEAT_MIX_CHANGE) !== 0 ? readMixChange(reader) : undefined;
  if ((flags & BEAT_STROKE) !== 0) {
    reader.readUnsignedByte(); // stroke type
    reader.readUnsignedByte(); // stroke duration
  }
  return tempo;
}

function readMixChange(reader: ByteReader): number | undefined {
  const flags = reader.readUnsignedByte();
  let tempo: number | undefined;
  if ((flags & MIX_TEMPO) !== 0) {
    tempo = reader.readInt();
    reader.readUnsignedByte();
  }
  for (const field of MIX_TWO_BYTE_FIELDS) {
    if ((flags & field) !== 0) {
      reader.readUnsignedByte();
      reader.readUnsignedByte();
    }
  }
  if ((flags & MIX_INSTRUMENT) !== 0) {
    reader.readUnsignedByte();
  }
  return tempo;
}

/** (MIN_VELOCITY + VELOCITY_INCREMENT * dynamic) - VELOCITY_INCREMENT, kept in 0…127. */
function readDynamic(reader: ByteReader): number {
  return velocityFromGp(reader.readUnsignedByte());
}
