// A track's instrument chosen (no TuxGuitar counterpart; Guitar Pro 7/8 give a track one instrument, and its kind —
// a stringed guitar or bass, a keyboard, drums … — is what the track is): an instrument of another kind makes the track
// that kind as Add Track makes one (edit/track-kinds.ts: strings and tuning, clef, channel), every note re-fretted to
// keep its pitch (setTrackTuning). Drums and pitched instruments cannot play each other's notes.
import { trackInstrumentOf } from '../composition/track-instrument';
import { GM_BANJO_PROGRAM, createChannelName, isGmBassProgram } from '../formats/common/channels';
import { isGuitarProgram, isKeyboardProgram } from '../formats/common/instrument-sets';
import { PERCUSSION_STRING_COUNT } from '../formats/midi/midi-strings';
import { DEFAULT_PERCUSSION_BANK } from '../model/defaults';
import type { Beat, Channel, Clef, Song, Track } from '../model/song';
import { trackKindOf } from '../transcription/instruments';
import { type TuningChange, setTrackTuning } from './retune';
import { updateTrack } from './song-paths';
import { type TrackKind, trackKindSpec, trackTuningChoices } from './track-kinds';
import { isMidiValue, setTrackProgram, updateTrackChannel } from './track-sound';
import { trackKindClef } from './tracks';

/** What the instrument picker offers: a General MIDI program, or the drum kit (the percussion bank's first kit). */
export type InstrumentChoice = number | 'drums';

/** What choosing an instrument makes of a track. */
export interface InstrumentPlan {
  /** What the track is now, and what it becomes. */
  readonly from: TrackKind;
  readonly to: TrackKind;
  /** Its new strings (open-string MIDI pitches, string 1 first); absent: they stay. */
  readonly tuning?: readonly number[];
  /** The clef every bar gets; absent: the clefs stay. */
  readonly clef?: Clef;
  /** Notes the change takes out: drums and pitched instruments cannot play each other's notes. */
  readonly notesLost: number;
}

/** A track's new instrument, and what its new strings could not keep (setTrackTuning's counts). */
export interface InstrumentChange extends TuningChange {
  /** Notes taken out by a change between drums and a pitched instrument (the rhythm stays, as rests). */
  readonly notesRemoved: number;
}

export interface InstrumentOptions {
  /** Only the sound changes: a pitched track keeps its strings, tuning, clef and icon whatever the instrument. */
  readonly keepsTrack?: boolean;
}

const DRUM_STRINGS: readonly number[] = Array.from({ length: PERCUSSION_STRING_COUNT }, () => 0);

/** The kind of track an instrument is played on (a ukulele is a guitar sound on a ukulele's strings: General MIDI has none). */
export function programTrackKind(choice: InstrumentChoice): TrackKind {
  if (choice === 'drums') {
    return 'drums';
  }
  if (isGmBassProgram(choice)) {
    return 'bass';
  }
  if (choice === GM_BANJO_PROGRAM) {
    return 'banjo';
  }
  if (isGuitarProgram(choice)) {
    return 'guitar';
  }
  return isKeyboardProgram(choice) ? 'keys' : 'other';
}

function isChoice(choice: InstrumentChoice): boolean {
  return choice === 'drums' || isMidiValue(choice);
}

/** True for the kinds whose strings are the instrument's own; a keyboard's or other instrument's only hold the notes. */
function isStringed(kind: TrackKind): boolean {
  return kind === 'guitar' || kind === 'bass' || kind === 'banjo' || kind === 'ukulele';
}

/** A kind's own strings, as Add Track gives a new track of it: its first string count's first tuning. */
function kindStrings(kind: TrackKind): readonly number[] | undefined {
  return kind === 'drums' ? DRUM_STRINGS : trackTuningChoices(kind, trackKindSpec(kind)?.stringCounts[0] ?? 0)[0]?.tuning;
}

/** The strings and clef a track of `from` gets as `to`: none for the same kind, or keys and other instruments from pitched ones. */
function plannedStrings(from: TrackKind, to: TrackKind): Pick<InstrumentPlan, 'tuning' | 'clef'> {
  const isDrumChange = (from === 'drums') !== (to === 'drums');
  return isDrumChange || (from !== to && isStringed(to)) ? { tuning: kindStrings(to), clef: trackKindClef(to) } : {};
}

function noteCount(track: Track): number {
  return track.measures.reduce((count, measure) => count + measure.beats.reduce((inBar, beat) => inBar + beat.voices.reduce((sum, voice) => sum + voice.notes.length, 0), 0), 0);
}

/**
 * What choosing `choice` makes of the track: the kind it becomes — a guitar sound keeps a ukulele one —, its strings
 * (a bass gets four, E1 A1 D2 G2, unless the track already is a bass; the same kind keeps the user's own) and clef, and
 * the notes a change between drums and a pitched instrument takes out. Undefined for a track the song lacks or a
 * program outside 0–127.
 */
export function planInstrumentChange(song: Song, trackIndex: number, choice: InstrumentChoice): InstrumentPlan | undefined {
  const track = song.tracks[trackIndex];
  const instrument = trackInstrumentOf(song, trackIndex);
  if (track === undefined || instrument === undefined || !isChoice(choice)) {
    return undefined;
  }
  const from = trackKindOf(instrument);
  const programKind = programTrackKind(choice);
  const to = from === 'ukulele' && programKind === 'guitar' ? 'ukulele' : programKind;
  const notesLost = (from === 'drums') !== (to === 'drums') ? noteCount(track) : 0;
  return { from, to, ...plannedStrings(from, to), notesLost };
}

/** The track without an icon of its own: it shows its new instrument's. */
function withoutOwnIcon(track: Track): Track {
  if (track.iconId === undefined) {
    return track;
  }
  const { iconId: _old, ...rest } = track;
  return rest;
}

function withClef(track: Track, clef: Clef | undefined): Track {
  return clef === undefined ? track : { ...track, measures: track.measures.map((measure) => (measure.clef === clef ? measure : { ...measure, clef })) };
}

/** The beat with its notes taken out (each voice a rest of its length) and its chord diagram, which drums cannot play. */
function withoutNotes(beat: Beat): Beat {
  const { chord: _chord, ...rest } = beat;
  return { ...rest, voices: beat.voices.map((voice) => (voice.notes.length === 0 ? voice : { ...voice, notes: [] })) };
}

/** The track's channel as the drum kit (the percussion bank, which the MIDI routes put on channel 10) or a pitched program. */
function kindChannel(channel: Channel, channels: readonly Channel[], choice: InstrumentChoice): Channel {
  const isDrums = choice === 'drums';
  const program = choice === 'drums' ? 0 : choice;
  const name = createChannelName(channels.filter((other) => other.id !== channel.id), program, isDrums);
  return { ...channel, name, program, isPercussion: isDrums, bank: isDrums ? DEFAULT_PERCUSSION_BANK : 0 };
}

/** A drum track made pitched or a pitched one drums: channel, strings, no capo, clef; the notes taken out. */
function changeDrums(song: Song, trackIndex: number, choice: InstrumentChoice, plan: InstrumentPlan): InstrumentChange {
  const channelled = updateTrackChannel(song, trackIndex, (channel) => kindChannel(channel, song.channels, choice));
  const changed = updateTrack(channelled, trackIndex, (track) => ({
    ...withClef(withoutOwnIcon(track), plan.clef),
    isPercussion: choice === 'drums',
    offset: 0,
    strings: (plan.tuning ?? []).map((open, index) => ({ number: index + 1, tuning: open })),
  }));
  const emptied = updateTrack(changed, trackIndex, (track) => ({ ...track, measures: track.measures.map((measure) => ({ ...measure, beats: measure.beats.map(withoutNotes) })) }));
  return { song: emptied, octaveShifted: 0, removed: 0, notesRemoved: plan.notesLost };
}

/**
 * New song where the track plays `choice` and is what it plays (planInstrumentChange): another kind's strings with every
 * note re-fretted to keep its pitch — octave moves and notes left out counted, as setTrackTuning counts them —, the
 * kind's clef on every bar and the new instrument's icon; the same kind (or `keepsTrack`) changes only the sound.
 * Between drums and a pitched instrument the track's notes are taken out (ask first: `notesLost`). A channel another
 * track shares is copied for this track first. Same song for nothing to change, a track it lacks or a program outside 0–127.
 */
export function setTrackInstrument(song: Song, trackIndex: number, choice: InstrumentChoice, options: InstrumentOptions = {}): InstrumentChange {
  const plan = planInstrumentChange(song, trackIndex, choice);
  const unchanged: InstrumentChange = { song, octaveShifted: 0, removed: 0, notesRemoved: 0 };
  if (plan === undefined || (plan.from === 'drums' && plan.to === 'drums')) {
    return unchanged;
  }
  if (choice === 'drums' || plan.from === 'drums') {
    return changeDrums(song, trackIndex, choice, plan);
  }
  const sounded = setTrackProgram(song, trackIndex, choice);
  if (options.keepsTrack === true || plan.from === plan.to) {
    return { ...unchanged, song: sounded };
  }
  const retuned = plan.tuning === undefined ? { song: sounded, octaveShifted: 0, removed: 0 } : setTrackTuning(sounded, trackIndex, plan.tuning);
  return { ...retuned, song: updateTrack(retuned.song, trackIndex, (track) => withClef(withoutOwnIcon(track), plan.clef)), notesRemoved: 0 };
}
