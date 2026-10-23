// Compressed MusicXML (.mxl; no TuxGuitar reader exists): a zip whose META-INF/container.xml names the score.
import { unzipSync } from 'fflate';
import { GpFormatError } from '../../errors';
import { attribute, child, children } from '../gpif/xml';
import { decodeMusicXml, parseMusicXmlContainer } from './musicxml-document';

const CONTAINER_ENTRY = 'META-INF/container.xml';
const META_INF = 'META-INF/';
const SCORE_EXTENSIONS = /\.(musicxml|xml)$/i;
/** Entries larger than this are not unpacked (a score of tens of megabytes is already very long). */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
/** Guitar Pro 7/8 archives hold their score here; such a zip is never MusicXML. */
const GP7_SCORE_ENTRY = 'Content/score.gpif';

/** Names of the entries of a zip, without unpacking any; undefined when the bytes are not a readable zip. */
function entryNames(bytes: Uint8Array): readonly string[] | undefined {
  const names: string[] = [];
  try {
    unzipSync(bytes, {
      filter: (file) => {
        names.push(file.name);
        return false;
      },
    });
  } catch {
    return undefined;
  }
  return names;
}

/** True for a zip holding META-INF/container.xml (and no Guitar Pro score): compressed MusicXML. */
export function isMusicXmlArchive(bytes: Uint8Array): boolean {
  const names = entryNames(bytes);
  return names !== undefined && names.includes(CONTAINER_ENTRY) && !names.includes(GP7_SCORE_ENTRY);
}

function unzipEntries(bytes: Uint8Array, wanted: (name: string) => boolean): Readonly<Record<string, Uint8Array>> {
  try {
    return unzipSync(bytes, { filter: (file) => wanted(file.name) && file.originalSize <= MAX_ENTRY_BYTES });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new GpFormatError(`Corrupt compressed MusicXML file: invalid zip archive (${reason})`, { cause: error });
  }
}

/** The first rootfile container.xml names (a MusicXML score, by its media type when one is given). */
function rootfilePath(containerBytes: Uint8Array | undefined): string | undefined {
  if (containerBytes === undefined) {
    return undefined;
  }
  try {
    const rootfiles = children(child(parseMusicXmlContainer(decodeMusicXml(containerBytes)), 'rootfiles'), 'rootfile');
    const score = rootfiles.find((rootfile) => (attribute(rootfile, 'media-type') ?? 'application/vnd.recordare.musicxml+xml').includes('musicxml'));
    return attribute(score, 'full-path');
  } catch {
    return undefined;
  }
}

/** The score's bytes: the rootfile container.xml names, else the first .musicxml / .xml entry outside META-INF. */
export function readMusicXmlArchive(bytes: Uint8Array): Uint8Array {
  const container = unzipEntries(bytes, (name) => name === CONTAINER_ENTRY)[CONTAINER_ENTRY];
  const named = rootfilePath(container);
  const candidates = (entryNames(bytes) ?? []).filter((name) => !name.startsWith(META_INF) && SCORE_EXTENSIONS.test(name));
  const path = named !== undefined && candidates.includes(named) ? named : candidates[0];
  const score = path === undefined ? undefined : unzipEntries(bytes, (name) => name === path)[path];
  if (score === undefined) {
    throw new GpFormatError('Not a compressed MusicXML file: the archive holds no score');
  }
  return score;
}
