import { UnsupportedFormatError } from '../../errors';
import type { Song } from '../../model/song';
import type { DetectedFormat } from '../detect';
import type { ResolvedReadOptions } from '../options';

export function readGp7(_bytes: Uint8Array, _detected: DetectedFormat, _options: ResolvedReadOptions): Song {
  throw new UnsupportedFormatError('gp7 reader is not implemented yet');
}
