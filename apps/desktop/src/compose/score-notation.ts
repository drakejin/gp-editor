// i18n-exempt-file: the score written as text for Claude's prompt, never shown
import {
  type Beat,
  type Duration,
  type Note,
  type Song,
  type TranscribedInstrument,
  isFrettedInstrument,
  tabFret,
  trackInstrumentOf,
  trackTuning,
  writtenTransposition,
} from '@gp-editor/core';
import { pitchNameInKey } from '../lib/pitch';
import { measureSyllables } from '../score/lyrics';

/** Note values as one letter: whole, half, quarter, eighth, 16th, 32nd, 64th. */
const VALUE_CODES: Readonly<Record<number, string>> = {
  1: 'w',
  2: 'h',
  4: 'q',
  8: 'e',
  16: 's',
  32: 't',
  64: 'x',
};

/** How the score text writes a beat and its notes; the request quotes it. */
export const NOTATION_LEGEND = [
  'Each beat is duration:notes, beats separated by spaces. Durations: w h q e s t x (whole, half, quarter, eighth, 16th, 32nd, 64th); "." dotted, ".." double-dotted; "/3" a triplet (/n: n notes in the time of the next lower power of two).',
  'Notes struck together are joined by "+"; r is a rest. A guitar, bass, ukulele or banjo note is its pitch @ string/fret (string 1 = the highest; banjo frets as banjo tab writes them); a drum note is its General MIDI key (the drum names are with the instruments); any other note is its pitch.',
  'Pitches: guitar, bass and banjo the written pitch (an octave above the sound: the low E string is E3), every other track the sounding pitch.',
  'A "~" before a note: tied to the note before. Effects after a note in brackets: h hammer-on / pull-off, sl slide, b bend, v vibrato, pm palm mute, lr let ring, x dead note, g ghost note, > accent, harm harmonic.',
  '"3*e:A3@6/5": the same beat three times; "e:=": the notes of the beat before again. A {name} before a beat is its chord name. A track playing in more than one voice: "v1: … | v2: …". Lyrics: the syllables sung in the bar.',
  'A track not listed in a bar rests in it; "2: =17": track 2 plays in this bar what it plays in bar 17.',
].join('\n');

/** "q", "e.", "s/3": a duration as the score text writes it. */
export function durationCode(duration: Duration): string {
  const dots = duration.doubleDotted ? '..' : duration.dotted ? '.' : '';
  const tuplet =
    duration.tuplet.enters === duration.tuplet.times
      ? ''
      : `/${duration.tuplet.enters}`;
  return `${VALUE_CODES[duration.value] ?? '?'}${dots}${tuplet}`;
}

/** How a track's notes are written: drum keys, tab with the written pitch, or the sounding pitch. */
export interface TrackNotation {
  readonly trackIndex: number;
  readonly instrument: TranscribedInstrument;
  /** Open strings, string 1 first. */
  readonly tuning: readonly number[];
  readonly capo: number;
  /** Semitones a pitch is written above its sound (PAGE_PITCH_RULE: guitar, bass and banjo an octave; 0 for the rest). */
  readonly writtenAbove: number;
}

export function trackNotationOf(song: Song, trackIndex: number): TrackNotation {
  const track = song.tracks[trackIndex];
  const instrument = trackInstrumentOf(song, trackIndex) ?? 'guitar';
  const tuning = track === undefined ? [] : trackTuning(track);
  const program =
    song.channels.find(channel => channel.id === track?.channelId)?.program ??
    0;
  const writtenAbove = isFrettedInstrument(instrument)
    ? writtenTransposition(program, false, tuning)
    : 0;
  return {
    trackIndex,
    instrument,
    tuning,
    capo: track?.offset ?? 0,
    writtenAbove,
  };
}

/** The contract's effects a note has, as the legend's codes. */
function effectCodes(note: Note): readonly string[] {
  const { effect } = note;
  const flags: readonly (readonly [boolean, string])[] = [
    [effect.hammer, 'h'],
    [effect.slides.length > 0, 'sl'],
    [effect.bend !== undefined, 'b'],
    [effect.vibrato || effect.wideVibrato, 'v'],
    [effect.palmMute, 'pm'],
    [effect.letRing, 'lr'],
    [effect.deadNote, 'x'],
    [effect.ghostNote, 'g'],
    [effect.accentuatedNote || effect.heavyAccentuatedNote, '>'],
    [effect.harmonic !== undefined, 'harm'],
  ];
  return flags.filter(([isSet]) => isSet).map(([, code]) => code);
}

/** One note: "E3@6/0", "36", "C#5", with its tie and effects. */
function noteText(
  notation: TrackNotation,
  note: Note,
  keySignature: number,
): string {
  const effects = effectCodes(note);
  const suffix = effects.length === 0 ? '' : `[${effects.join(',')}]`;
  const tie = note.isTied ? '~' : '';
  if (notation.instrument === 'drums') {
    return `${tie}${note.fret}${suffix}`;
  }
  const sounding =
    (notation.tuning[note.string - 1] ?? 0) + notation.capo + note.fret;
  const pitch = pitchNameInKey(sounding + notation.writtenAbove, keySignature);
  const tab = isFrettedInstrument(notation.instrument)
    ? `@${note.string}/${tabFret(notation.tuning, note.string, note.fret)}`
    : '';
  return `${tie}${pitch}${tab}${suffix}`;
}

/** Notes low to high (the highest string last). */
function byPitch(
  notation: TrackNotation,
  notes: readonly Note[],
): readonly Note[] {
  const pitch = (note: Note) =>
    notation.instrument === 'drums'
      ? note.fret
      : (notation.tuning[note.string - 1] ?? 0) + note.fret;
  return [...notes].sort((a, b) => pitch(a) - pitch(b));
}

/** A voice's event at a beat: chord name, duration and notes ("E3@6/0+B3@5/2", "r"); undefined where the voice has none. */
function beatParts(
  notation: TrackNotation,
  beat: Beat,
  voiceIndex: number,
  keySignature: number,
  isFirstVoiceShown: boolean,
): BeatParts | undefined {
  const voice = beat.voices[voiceIndex];
  if (voice === undefined || voice.isEmpty) {
    return undefined;
  }
  const chordName = beat.chord?.name.trim() ?? '';
  const chord = isFirstVoiceShown && chordName !== '' ? `{${chordName}}` : '';
  const notes =
    voice.notes.length === 0
      ? 'r'
      : byPitch(notation, voice.notes)
          .map(note => noteText(notation, note, keySignature))
          .join('+');
  return { chord, duration: durationCode(voice.duration), notes };
}

/** A voice's event: its chord name, duration and notes as text. */
interface BeatParts {
  readonly chord: string;
  readonly duration: string;
  readonly notes: string;
}

/**
 * A voice's events as text: runs of the same event as "n*event", then an event playing the notes of the one before
 * again (another duration) as "duration:=".
 */
function voiceText(events: readonly BeatParts[]): string {
  const runs = events.reduce<readonly (readonly [BeatParts, number])[]>(
    (found, event) => {
      const last = found.at(-1);
      const isSame =
        last !== undefined &&
        last[0].chord === event.chord &&
        last[0].duration === event.duration &&
        last[0].notes === event.notes;
      return last !== undefined && isSame
        ? [...found.slice(0, -1), [event, last[1] + 1]]
        : [...found, [event, 1]];
    },
    [],
  );
  return runs
    .map(([event, count], index) => {
      const previous = runs[index - 1]?.[0];
      const notes =
        previous !== undefined &&
        event.notes !== 'r' &&
        previous.notes === event.notes
          ? '='
          : event.notes;
      return `${count === 1 ? '' : `${count}*`}${event.chord}${
        event.duration
      }:${notes}`;
    })
    .join(' ');
}

/** Indexes of the voices that play a note in the measure. */
function playingVoices(beats: readonly Beat[]): readonly number[] {
  const count = beats.reduce(
    (most, beat) => Math.max(most, beat.voices.length),
    0,
  );
  return Array.from({ length: count }, (_, voiceIndex) => voiceIndex).filter(
    voiceIndex =>
      beats.some(beat => (beat.voices[voiceIndex]?.notes.length ?? 0) > 0),
  );
}

/**
 * What a track plays in a bar, as the score text writes it after the track's index — "q:E3@6/0 2*e:r …", each voice that
 * plays ("v1: … | v2: …"), then its sung syllables — or undefined when the track rests in the bar.
 */
export function trackBarText(
  song: Song,
  notation: TrackNotation,
  measureIndex: number,
): string | undefined {
  const track = song.tracks[notation.trackIndex];
  const measure = track?.measures[measureIndex];
  if (track === undefined || measure === undefined) {
    return undefined;
  }
  const voices = playingVoices(measure.beats);
  if (voices.length === 0) {
    return undefined;
  }
  const first = voices[0];
  const lines = voices.map(voiceIndex => {
    const events = measure.beats.flatMap(
      beat =>
        beatParts(
          notation,
          beat,
          voiceIndex,
          measure.keySignature,
          voiceIndex === first,
        ) ?? [],
    );
    return `${
      voices.length > 1 || voiceIndex > 0 ? `v${voiceIndex + 1}: ` : ''
    }${voiceText(events)}`;
  });
  const syllables = measureSyllables(track, measureIndex).map(
    syllable => syllable.text,
  );
  const lyrics =
    syllables.length === 0 ? '' : ` / lyrics: ${syllables.join(' ')}`;
  return `${lines.join(' | ')}${lyrics}`;
}
