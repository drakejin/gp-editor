// Compressed MusicXML (.mxl), which TuxGuitar does not write: a zip holding the score and META-INF/container.xml naming it.
import { zipSync } from 'fflate';
import { utf8Bytes } from '../../midi/midi-bytes';
import type { Song } from '../../model/song';
import { writeMusicXml } from './musicxml-writer';

/** The score's name inside the archive, as container.xml names it. */
export const MXL_SCORE_ENTRY = 'score.musicxml';
export const MXL_CONTAINER_ENTRY = 'META-INF/container.xml';
const MIMETYPE_ENTRY = 'mimetype';
const MXL_MIMETYPE = 'application/vnd.recordare.musicxml';
const SCORE_MEDIA_TYPE = 'application/vnd.recordare.musicxml+xml';

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="${MXL_SCORE_ENTRY}" media-type="${SCORE_MEDIA_TYPE}"/>
  </rootfiles>
</container>
`;

/** A fixed time stamp for the entries, so the same song always gives the same bytes (zip times start in 1980). */
const ENTRY_TIME = new Date(1980, 0, 1);
const DEFLATE_LEVEL = 6;
const STORED = 0;

/** UTF-8 bytes of a MusicXML document (what a .musicxml file holds); no TextEncoder, which Hermes lacks. */
export function encodeMusicXml(xml: string): Uint8Array {
  return Uint8Array.from(utf8Bytes(xml));
}

/**
 * The song as compressed MusicXML (.mxl): `mimetype` first and stored (MusicXML 4.0), then META-INF/container.xml
 * pointing at the score, then the score from writeMusicXml.
 *
 * @throws RangeError when the song has no measure or no track
 */
export function writeMusicXmlArchive(song: Song): Uint8Array {
  const score = encodeMusicXml(writeMusicXml(song));
  return zipSync(
    {
      [MIMETYPE_ENTRY]: [encodeMusicXml(MXL_MIMETYPE), { level: STORED }],
      [MXL_CONTAINER_ENTRY]: encodeMusicXml(CONTAINER_XML),
      [MXL_SCORE_ENTRY]: score,
    },
    { level: DEFLATE_LEVEL, mtime: ENTRY_TIME },
  );
}
