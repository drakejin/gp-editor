// i18n-exempt-file: the score's instruments described for Claude's prompt, never shown
import {
  GM_INSTRUMENT_NAMES,
  type Song,
  gmPercussionName,
  isFrettedInstrument,
} from '@gp-editor/core';
import { pitchName } from '../lib/pitch';
import { trackNotationOf } from './score-notation';

/** The drum keys a track strikes anywhere, low to high, with their General MIDI names. */
function drumsUsed(song: Song, trackIndex: number): string {
  const keys = new Set(
    (song.tracks[trackIndex]?.measures ?? []).flatMap(measure =>
      measure.beats.flatMap(beat =>
        beat.voices.flatMap(voice => voice.notes.map(note => note.fret)),
      ),
    ),
  );
  const named = [...keys]
    .sort((a, b) => a - b)
    .map(key => `${key} ${gmPercussionName(key) ?? 'unnamed drum'}`);
  return named.length === 0
    ? ', no drums played yet'
    : `, drums used: ${named.join(', ')}`;
}

/**
 * One track as the request lists it: `2: "Bass" — bass, GM program 33 (…), 4 strings E1 A1 D2 G2 (lowest first), bass
 * clef — write it`: its index, name, instrument, sound, a fretted instrument's strings and capo, its clef (a drum track:
 * the drums it plays), and whether the answer may write it.
 */
function trackLine(
  song: Song,
  trackIndex: number,
  isWritable: boolean,
): string {
  const track = song.tracks[trackIndex];
  const notation = trackNotationOf(song, trackIndex);
  const access = isWritable ? 'write it' : 'read only';
  if (track === undefined) {
    return '';
  }
  if (notation.instrument === 'drums') {
    return `${trackIndex}: "${track.name}" — drums${drumsUsed(
      song,
      trackIndex,
    )} — ${access}`;
  }
  const program =
    song.channels.find(channel => channel.id === track.channelId)?.program ?? 0;
  const strings = isFrettedInstrument(notation.instrument)
    ? `, ${notation.tuning.length} strings ${[...notation.tuning]
        .reverse()
        .map(pitchName)
        .join(' ')} (lowest first)${
        notation.capo > 0 ? `, capo ${notation.capo}` : ''
      }`
    : '';
  const clef = track.measures[0]?.clef ?? 'treble';
  return `${trackIndex}: "${track.name}" — ${
    notation.instrument
  }, GM program ${program} (${
    GM_INSTRUMENT_NAMES[program] ?? '?'
  })${strings}, ${clef} clef — ${access}`;
}

/** Every track of the song, one line each, the ones the answer may write marked so. */
export function describeInstruments(
  song: Song,
  writableTracks: readonly number[],
): string {
  const writable = new Set(writableTracks);
  return song.tracks
    .map((_, trackIndex) =>
      trackLine(song, trackIndex, writable.has(trackIndex)),
    )
    .join('\n');
}
