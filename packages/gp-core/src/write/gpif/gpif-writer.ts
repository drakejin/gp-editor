// The GPIF document of a song (no TuxGuitar counterpart: TuxGuitar reads GPIF, GPXDocumentReader, but has no writer).
import type { MeasureHeader, Song, Track } from '../../model/song';
import { resolveKeySignatures } from '../gtp-song';
import { type TrackPlan, buildPools } from './gpif-bars';
import { chordIdsOf } from './gpif-chords';
import { isAnacrusis, leadingShiftOf, noteLinksOf } from './gpif-layout';
import { masterBarsNode, masterTrackNode } from './gpif-master-bars';
import { scoreNode } from './gpif-score';
import { assignMidiChannels, isPercussionTrack } from './gpif-sounds';
import { tracksNode } from './gpif-tracks';
import { drumKitFor } from './drum-kit';
import { serializeXmlDocument, xmlElement, xmlText } from './xml-writer';

/** The Guitar Pro version the document claims: Guitar Pro 7.6 (which Guitar Pro 8 opens too). */
const GPIF_GP_VERSION = '7.6.0';
const GP_REVISION = { required: '12021', recommended: '12023', revision: '12025' } as const;
const ENCODING = 'GP7';

/** Every fret a drum track plays (notes and grace notes): its kit needs an articulation for each. */
function drumPitchesOf(track: Track): readonly number[] {
  return track.measures.flatMap((measure) =>
    measure.beats.flatMap((beat) =>
      beat.voices.flatMap((voice) =>
        voice.notes.flatMap((note) => (note.effect.grace === undefined ? [note.fret] : [note.fret, note.effect.grace.fret])),
      ),
    ),
  );
}

function planTrack(song: Song, track: Track, firstHeader: MeasureHeader | undefined): TrackPlan {
  const isPercussion = isPercussionTrack(song, track);
  const firstMeasure = track.measures[0];
  return {
    track,
    noteContext: { strings: track.strings, capo: track.offset, isPercussion, drumKit: isPercussion ? drumKitFor(drumPitchesOf(track)) : [] },
    chordIds: chordIdsOf(track),
    links: noteLinksOf(track),
    leadingShift: firstMeasure === undefined || firstHeader === undefined ? 0 : leadingShiftOf(firstMeasure, firstHeader),
  };
}

/** The GPIF document (Content/score.gpif) of a song, as Guitar Pro 7.6 writes it. */
export function buildGpifXml(song: Song): string {
  const firstHeader = song.measureHeaders[0];
  const keySignatures = resolveKeySignatures(song);
  const plans = song.tracks.map((track) => planTrack(song, track, firstHeader));
  const pools = buildPools(song, plans, keySignatures);
  const root = xmlElement('GPIF', [
    xmlText('GPVersion', GPIF_GP_VERSION),
    xmlText('GPRevision', GP_REVISION.revision, { required: GP_REVISION.required, recommended: GP_REVISION.recommended }),
    xmlElement('Encoding', [xmlText('EncodingDescription', ENCODING)]),
    scoreNode(song.info),
    masterTrackNode(song, isAnacrusis(song.tracks, firstHeader)),
    xmlElement('AudioTracks'),
    tracksNode(song, plans, assignMidiChannels(song)),
    masterBarsNode(song, keySignatures, pools.barIds),
    xmlElement('Bars', pools.bars),
    xmlElement('Voices', pools.voices),
    xmlElement('Beats', pools.beats),
    xmlElement('Notes', pools.notes),
    xmlElement('Rhythms', pools.rhythms),
  ]);
  return serializeXmlDocument(root);
}
