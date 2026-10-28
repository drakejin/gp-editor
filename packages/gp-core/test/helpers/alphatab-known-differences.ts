import type { Song } from '../../src/model/song';
import { encodeGpString } from '../../src/write/gp-strings';
import { drumKitFor } from '../../src/write/gpif/drum-kit';
import type { WritableFormat } from '../../src/write/index';
import { type DifferenceLocation, locate, type ViewDifference } from './cross-check-diff';
import type { BeatView, ScoreView } from './cross-check-view';

/*
 * The differences the alphaTab cross-check accepts, each with the reason and the evidence. Everything else alphaTab reads
 * differently from gp-core in a written file fails the cross-check.
 *
 * Most are alphaTab's own reading, shown to be so because alphaTab reads Guitar Pro's original fixtures the same way
 * (cross-check-alphatab.test.ts pins that evidence). One is gp-core's reader (an empty beat in GP3/GP4), one a known limit
 * of the GP3–GP5 formats (text windows-1252 cannot hold). alphaTab is MPL-2.0; its behaviour is described here, no code
 * of it is copied but for the three numbers of its GP5 drum map.
 */

/** What a rule may look at besides the difference. */
export interface DifferenceContext {
  readonly format: WritableFormat;
  /** gp-core's view of the written file. */
  readonly expected: ScoreView;
  /** gp-core's song of the written file (raw texts). */
  readonly song: Song;
}

export interface KnownDifference {
  readonly id: string;
  /** What reads differently, why, and the evidence. */
  readonly reason: string;
  readonly formats: readonly WritableFormat[];
}

/** A difference of one field, accepted as a whole. */
interface FieldRule extends KnownDifference {
  readonly matches: (difference: ViewDifference, where: DifferenceLocation, context: DifferenceContext) => boolean;
}

/** Effect tags gp-core has and alphaTab lacks (`missing`) and/or the tag alphaTab has instead (`extra`). */
interface TagRule extends KnownDifference {
  readonly missing?: (tag: string) => boolean;
  readonly extra?: (tag: string) => boolean;
  readonly when?: (where: DifferenceLocation, context: DifferenceContext) => boolean;
}

const BINARY_FORMATS: readonly WritableFormat[] = ['gp5', 'gp4', 'gp3'];
const ALL_FORMATS: readonly WritableFormat[] = ['gp', 'gp5', 'gp4', 'gp3'];

/** alphaTab looks this many bars back or ahead for a note on the same string (Note._maxOffsetForSameLineSearch). */
const SAME_LINE_BARS = 3;

/** The beats of the difference's voice from `fromBar` to `toBar`, as [bar, index, beat]. */
function voiceBeats(context: DifferenceContext, where: DifferenceLocation, fromBar: number, toBar: number): (readonly [number, number, BeatView])[] {
  const bars = context.expected.tracks[where.track ?? -1]?.bars ?? [];
  const found: (readonly [number, number, BeatView])[] = [];
  for (let bar = Math.max(0, fromBar); bar <= Math.min(toBar, bars.length - 1); bar++) {
    (bars[bar]?.voices[where.voice ?? -1] ?? []).forEach((beat, index) => found.push([bar, index, beat]));
  }
  return found;
}

function noteString(context: DifferenceContext, where: DifferenceLocation): number | undefined {
  const beat = context.expected.tracks[where.track ?? -1]?.bars[where.bar ?? -1]?.voices[where.voice ?? -1]?.[where.beat ?? -1];
  return beat?.notes[where.note ?? -1]?.string;
}

/**
 * Whether a later beat of the note's voice that alphaTab looks at has a note on the same string. alphaTab walks the beats'
 * `nextBeat` links while it finishes the bars in order, so beyond this bar only the next bar's first beat is linked yet.
 */
function hasLaterNoteOnString(where: DifferenceLocation, context: DifferenceContext): boolean {
  const string = noteString(context, where);
  const bar = where.bar ?? 0;
  return voiceBeats(context, where, bar, bar + 1).some(
    ([b, index, beat]) => (b > bar ? index === 0 : index > (where.beat ?? 0)) && beat.notes.some((note) => note.string === string),
  );
}

/** Whether an earlier beat of the note's voice, within alphaTab's search, has a note on the same string. */
function hasEarlierNoteOnString(where: DifferenceLocation, context: DifferenceContext): boolean {
  const string = noteString(context, where);
  const bar = where.bar ?? 0;
  return voiceBeats(context, where, bar - SAME_LINE_BARS, bar).some(
    ([b, index, beat]) => (b < bar || index < (where.beat ?? 0)) && beat.notes.some((note) => note.string === string),
  );
}

function isDrumTrack(where: DifferenceLocation, context: DifferenceContext): boolean {
  return context.expected.tracks[where.track ?? -1]?.isPercussion === true;
}

/** Guitar Pro 3–5 drum keys alphaTab maps to other articulations of its own (Gp3To5Importer._gp5PercussionInstrumentMap). */
const ALPHATAB_GP5_DRUM_MAP: ReadonlyMap<number, number> = new Map([
  [27, 42],
  [28, 60],
  [32, 31],
]);

/** The MIDI note GP7's factory kit plays for a drum note of `key` (its articulation's output). */
function drumOutput(key: number): number | undefined {
  return drumKitFor([key])
    .flatMap((element) => element.articulations)
    .find((articulation) => articulation.inputMidi === key)?.outputMidi;
}

const TUPLET = /^\(\d+:\d+\)$/;

function isOnlyInnerTupletLost(expected: unknown, actual: unknown): boolean {
  return typeof expected === 'string' && typeof actual === 'string' && actual.includes('(') && expected.startsWith(actual) && TUPLET.test(expected.slice(actual.length));
}

/** A bar gp-core reads as one quarter rest (Guitar Pro's empty beat) and alphaTab as no beat at all. */
function isEmptyBeatBar(where: DifferenceLocation, context: DifferenceContext): boolean {
  const voices = context.expected.tracks[where.track ?? -1]?.bars[where.bar ?? -1]?.voices ?? [];
  const beat = voices[0]?.[0];
  return voices.length === 1 && voices[0]?.length === 1 && beat?.duration === '4' && beat.notes.length === 0 && beat.effects.length === 0;
}

const WINDOWS_1252 = new TextDecoder('windows-1252');

/** Whether Guitar Pro (and alphaTab), decoding windows-1252, shows `text` as gp-core's writer encodes it. */
function isReadAsWritten(text: string): boolean {
  return WINDOWS_1252.decode(encodeGpString(text)) === text;
}

/** The raw text behind a text difference (title, artist, track name, lyrics). */
function rawText(difference: ViewDifference, where: DifferenceLocation, context: DifferenceContext): string | undefined {
  const track = context.song.tracks[where.track ?? -1];
  switch (difference.path) {
    case 'score.title':
      return context.song.info.title;
    case 'score.artist':
      return context.song.info.artist;
    default:
      return where.field === 'name' ? track?.name : where.field === 'lyrics' ? track?.lyrics?.text : undefined;
  }
}

export const FIELD_RULES: readonly FieldRule[] = [
  {
    id: 'lone-tie',
    reason:
      'alphaTab drops a tie when no earlier note of the voice on the same string is found within 3 bars (Note.findTieOrigin); ' +
      'gp-core keeps the flag. Guitar Pro’s own canon.gp5 reads the same in alphaTab.',
    formats: ALL_FORMATS,
    matches: (difference, where, context) =>
      where.field === 'isTied' && difference.expected === true && difference.actual === false && !hasEarlierNoteOnString(where, context),
  },
  {
    id: 'drum-tuning',
    reason: 'alphaTab has no tuning on a drum staff (Staff.finish clears it); every drum track of the fixtures reads so.',
    formats: ALL_FORMATS,
    matches: (difference, where, context) =>
      where.field === 'tuning' && where.bar === undefined && isDrumTrack(where, context) && Array.isArray(difference.actual) && difference.actual.length === 0,
  },
  {
    id: 'gp5-drum-articulations',
    reason:
      'alphaTab gives the GP3–GP5 drum keys 27, 28 and 32 articulations 42, 60 and 31 of its own; percussion-all.gp5 ' +
      '(Guitar Pro 5) reads the same in alphaTab.',
    formats: BINARY_FORMATS,
    matches: (difference, where, context) =>
      where.field === 'fret' && isDrumTrack(where, context) && ALPHATAB_GP5_DRUM_MAP.get(Number(difference.expected)) === difference.actual,
  },
  {
    id: 'gpif-drum-output',
    reason:
      'In GPIF alphaTab names a drum note by the MIDI note its articulation plays (outputMidiNumber), gp-core by the ' +
      'articulation’s key (input MIDI); GP7’s kit maps one to the other. drum-tabs.gp and faulty.gp read the same in alphaTab.',
    formats: ['gp'],
    matches: (difference, where, context) =>
      where.field === 'fret' && isDrumTrack(where, context) && drumOutput(Number(difference.expected)) === difference.actual,
  },
  {
    id: 'secondary-tuplet',
    reason: 'alphaTab reads a GPIF rhythm’s <PrimaryTuplet> only, not the <SecondaryTuplet> inside it (GpifParser).',
    formats: ['gp'],
    matches: (difference, where) => where.field === 'duration' && isOnlyInnerTupletLost(difference.expected, difference.actual),
  },
  {
    id: 'gp34-empty-beat',
    reason:
      'Guitar Pro’s empty beat (status 0x00) is no beat in alphaTab; gp-core’s GP3/GP4 readers read it as a quarter rest, ' +
      'as TuxGuitar does (gtp-normalize.test.ts). Guitar Pro’s own GP3/GP4 fixtures read the same.',
    formats: ['gp4', 'gp3'],
    matches: (difference, where, context) =>
      where.field === 'length' && where.voice === undefined && difference.actual === 0 && isEmptyBeatBar(where, context),
  },
  {
    id: 'text-outside-windows-1252',
    reason:
      'Format limit, not alphaTab: GP3–GP5 text is windows-1252 on Western systems; text it cannot hold is written as UTF-8 ' +
      '(gp-strings.ts), which Guitar Pro there, like alphaTab, shows as other characters.',
    formats: BINARY_FORMATS,
    matches: (difference, where, context) => {
      const text = rawText(difference, where, context);
      return text !== undefined && !isReadAsWritten(text);
    },
  },
];

export const TAG_RULES: readonly TagRule[] = [
  {
    id: 'lone-slide-or-hammer',
    reason:
      'alphaTab drops a shift or legato slide and a hammer-on/pull-off when it finds no later note on the same string ' +
      '(Note.finish), and it looks no further than the next bar’s first beat; gp-core keeps the flag. hammer.gp5, ' +
      'slides.gp3 and canon.gp5 (Guitar Pro) read the same in alphaTab.',
    formats: ALL_FORMATS,
    missing: (tag) => tag === 'hammer' || tag === 'slide-out:shift' || tag === 'slide-out:legato',
    when: (where, context) => where.note !== undefined && !hasLaterNoteOnString(where, context),
  },
  {
    id: 'wide-vibrato-as-slight',
    reason:
      'alphaTab reads the GP3–GP5 beat’s wide-vibrato bit (0x02) as slight vibrato (Gp3To5Importer.readBeatEffects); ' +
      'vibrato.gp4 and effects.gp5 (Guitar Pro) read the same in alphaTab.',
    formats: BINARY_FORMATS,
    missing: (tag) => tag === 'vibrato:wide',
    extra: (tag) => tag === 'vibrato:slight',
  },
  {
    id: 'gp3-tremolo-bar',
    reason: 'alphaTab skips the GP3 tremolo bar (beat effect 0x20, type 0); effects.gp3 (Guitar Pro 3) reads the same in alphaTab.',
    formats: ['gp3'],
    missing: (tag) => tag === 'whammy',
    when: (where) => where.note === undefined,
  },
  {
    id: 'gp34-dead-grace',
    reason:
      'GP3/GP4 store a dead grace note as fret 255; alphaTab reads that fret as -1 and does not mark it dead. ' +
      'fade-to-black.gp4 (Guitar Pro 4) reads the same in alphaTab.',
    formats: ['gp4', 'gp3'],
    missing: (tag) => tag === 'grace:x',
    extra: (tag) => tag === 'grace:-1',
  },
];

/** `tags` without the first one `match` takes (all of them when there is no `match`); undefined when none matches. */
function remove(tags: readonly string[], match: ((tag: string) => boolean) | undefined): readonly string[] | undefined {
  if (match === undefined) {
    return tags;
  }
  const index = tags.findIndex(match);
  return index < 0 ? undefined : [...tags.slice(0, index), ...tags.slice(index + 1)];
}

/** The tag rules that explain every tag gp-core has and alphaTab lacks, and every tag alphaTab adds; undefined when some stay. */
function explainTags(difference: ViewDifference, where: DifferenceLocation, context: DifferenceContext): readonly string[] | undefined {
  const expected = difference.expected as readonly string[];
  const actual = difference.actual as readonly string[];
  let missing: readonly string[] = expected.filter((tag) => !actual.includes(tag));
  let extra: readonly string[] = actual.filter((tag) => !expected.includes(tag));
  const used = new Set<string>();
  for (const rule of TAG_RULES.filter((candidate) => candidate.formats.includes(context.format))) {
    if (rule.when !== undefined && !rule.when(where, context)) {
      continue;
    }
    for (;;) {
      const nextMissing = remove(missing, rule.missing);
      const nextExtra = remove(extra, rule.extra);
      if (nextMissing === undefined || nextExtra === undefined) {
        break;
      }
      [missing, extra] = [nextMissing, nextExtra];
      used.add(rule.id);
    }
  }
  return missing.length === 0 && extra.length === 0 ? [...used] : undefined;
}

/** The ids of the known differences that explain `difference`, or undefined when none does. */
export function explain(difference: ViewDifference, context: DifferenceContext): readonly string[] | undefined {
  const where = locate(difference.path);
  if (where.field === 'effects' && Array.isArray(difference.expected) && Array.isArray(difference.actual)) {
    return explainTags(difference, where, context);
  }
  const rule = FIELD_RULES.find((candidate) => candidate.formats.includes(context.format) && candidate.matches(difference, where, context));
  return rule === undefined ? undefined : [rule.id];
}

/** The differences no known difference explains: what the cross-check fails on. */
export function unexplainedDifferences(differences: readonly ViewDifference[], context: DifferenceContext): ViewDifference[] {
  return differences.filter((difference) => explain(difference, context) === undefined);
}
