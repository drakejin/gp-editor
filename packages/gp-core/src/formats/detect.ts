import { decodeWindows1252 } from '../io/text';
import type { FileFormat } from '../model/song';
import { readTefVersion } from './tef/tef-header';

export interface DetectedFormat {
  readonly format: FileFormat;
  /** Version string from the header; '' for container formats (read later from the container). */
  readonly version: string;
}

/** Header strings of the binary formats, as TuxGuitar's GTPFileFormatVersion lists them. */
const GTP_VERSIONS: ReadonlyMap<string, FileFormat> = new Map<string, FileFormat>([
  ['FICHIER GUITARE PRO v1', 'gp1'],
  ['FICHIER GUITARE PRO v1.01', 'gp1'],
  ['FICHIER GUITARE PRO v1.02', 'gp1'],
  ['FICHIER GUITARE PRO v1.03', 'gp1'],
  ['FICHIER GUITARE PRO v1.04', 'gp1'],
  ['FICHIER GUITAR PRO v2.20', 'gp2'],
  ['FICHIER GUITAR PRO v2.21', 'gp2'],
  ['FICHIER GUITAR PRO v3.00', 'gp3'],
  ['FICHIER GUITAR PRO v4.00', 'gp4'],
  ['FICHIER GUITAR PRO v4.06', 'gp4'],
  ['FICHIER GUITAR PRO L4.06', 'gp4'],
  ['FICHIER GUITAR PRO v5.00', 'gp5'],
  ['FICHIER GUITAR PRO v5.10', 'gp5'],
]);

/** Size of the fixed header block that holds the version string. */
export const GTP_VERSION_BLOCK = 30;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const BCFZ = 'BCFZ';
const BCFS = 'BCFS';
/** Power Tab (.ptb): "ptab" and a 16-bit version (PTFileFormatDetector). */
const PTAB = 'ptab';
const PTAB_HEADER_SIZE = 6;

/**
 * Identify a Guitar Pro file from its first bytes. Returns undefined for anything
 * that is not a known Guitar Pro format.
 *
 * - `.gp` (Guitar Pro 7/8): a ZIP archive
 * - `.gpx` (Guitar Pro 6): a BCFZ (compressed) or BCFS container
 * - `.gtp/.gp3/.gp4/.gp5` (Guitar Pro 1–5): a length-prefixed version string
 * - `.ptb` (Power Tab): "ptab" and a version number
 * - `.tef` (TablEdit 3 and later): a 256-byte header TuxGuitar's TEFileFormatDetector checks
 */
export function detectFormat(bytes: Uint8Array): DetectedFormat | undefined {
  if (startsWith(bytes, ZIP_MAGIC)) {
    return { format: 'gp7', version: '' };
  }
  const magic = decodeWindows1252(bytes.subarray(0, 4));
  if (magic === BCFZ || magic === BCFS) {
    return { format: 'gpx', version: magic };
  }
  if (magic === PTAB && bytes.length >= PTAB_HEADER_SIZE) {
    return { format: 'ptb', version: String((bytes[4] ?? 0) | ((bytes[5] ?? 0) << 8)) };
  }
  const tefVersion = readTefVersion(bytes);
  if (tefVersion !== undefined) {
    return { format: 'tef', version: tefVersion };
  }
  const version = readGtpVersion(bytes);
  const format = version === undefined ? undefined : GTP_VERSIONS.get(version);
  return format === undefined || version === undefined ? undefined : { format, version };
}

function readGtpVersion(bytes: Uint8Array): string | undefined {
  if (bytes.length < 1 + GTP_VERSION_BLOCK) {
    return undefined;
  }
  const length = Math.min(bytes[0] ?? 0, GTP_VERSION_BLOCK);
  return decodeWindows1252(bytes.subarray(1, 1 + length));
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}
