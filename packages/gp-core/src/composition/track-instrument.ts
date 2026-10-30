import { isFiveStringBanjo } from '../edit/banjo';
import { isVoiceName } from '../edit/track-properties';
import { isBassTuning, trackTuning } from '../edit/tuning-presets';
import { GM_BANJO_PROGRAM, gmFamilyIndex, isGmBassProgram } from '../formats/common/channels';
import { isUkuleleTuning } from '../formats/common/instrument-sets';
import type { Song } from '../model/song';
import type { TranscribedInstrument } from '../transcription/types';

/** General MIDI families played as keyboards: pianos (0–7) and organs (16–23). */
const KEYBOARD_FAMILIES: ReadonlySet<number> = new Set([0, 2]);
const GUITAR_FAMILY = 3;
/** General MIDI 52–54: choir aahs, voice oohs, synth voice. */
const VOICE_PROGRAMS = { first: 52, last: 54 } as const;
/** What a track plays when it has no channel: a steel guitar, as the readers' default channel. */
const DEFAULT_PROGRAM = 25;

/**
 * An existing track as the PDF import's contract names an instrument, so a model reads and writes its notes as the
 * contract says (tab for the fretted ones, sounding pitches for the others, drum names for drums): drums for a
 * percussion track; vocals for a voice program or a track named like a voice; a bass by its program or, on a guitar
 * program, a bass's strings; a banjo by its program or a 5-string banjo's strings; a ukulele for a guitar sound on a
 * ukulele's strings; any other guitar program a guitar; pianos and organs keys; everything else other. Undefined for a
 * track the song does not have.
 */
export function trackInstrumentOf(song: Song, trackIndex: number): TranscribedInstrument | undefined {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return undefined;
  }
  if (track.isPercussion) {
    return 'drums';
  }
  const program = song.channels.find((channel) => channel.id === track.channelId)?.program ?? DEFAULT_PROGRAM;
  const tuning = trackTuning(track);
  if ((program >= VOICE_PROGRAMS.first && program <= VOICE_PROGRAMS.last) || isVoiceName(track.name)) {
    return 'vocals';
  }
  if (isGmBassProgram(program)) {
    return 'bass';
  }
  if (program === GM_BANJO_PROGRAM || isFiveStringBanjo(tuning)) {
    return 'banjo';
  }
  if (gmFamilyIndex(program) === GUITAR_FAMILY) {
    return isUkuleleTuning(tuning) ? 'ukulele' : isBassTuning(tuning) ? 'bass' : 'guitar';
  }
  return KEYBOARD_FAMILIES.has(gmFamilyIndex(program)) ? 'keys' : 'other';
}
