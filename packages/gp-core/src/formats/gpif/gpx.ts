import { UnsupportedFormatError } from '../../errors';
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';

export function readGpx(_bytes: Uint8Array, _detected: DetectedFormat, _options: ResolvedReadOptions): Song {
  throw new UnsupportedFormatError('gpx reader is not implemented yet');
}
