// Port of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLWriter#writeMeasureAttributes / #writeDirection / #writeBarline (LGPL-2.1).
import { QUARTER_TIME } from '../../model/song';
import type { Clef, Measure, MeasureHeader, Track } from '../../model/song';
import type { PartContext } from './musicxml-beat';
import { pitchChildren } from './musicxml-note';
import { type XmlNode, element, textElement } from './xml-text';


const CLEF_SIGNS: Readonly<Record<Clef, readonly [sign: string, line: number | undefined]>> = {
  treble: ['G', 2],
  bass: ['F', 4],
  tenor: ['C', 4],
  alto: ['C', 3],
  neutral: ['percussion', undefined],
};

const SEMITONES_PER_OCTAVE = 12;

/**
 * Guitar and bass music sounds an octave below the written notes: the notation staff's clef says so
 * (clef-octave-change), for a track `writtenTransposition` writes an octave up; a piano's or a voice's clef has none.
 */
function clefElements(track: Track, measure: Measure, isStart: boolean, transposition: number): XmlNode[] {
  if (track.isPercussion) {
    return [element('clef', {}, [textElement('sign', 'percussion')])];
  }
  const [sign, line] = CLEF_SIGNS[measure.clef];
  const octaveChange = -Math.round(transposition / SEMITONES_PER_OCTAVE);
  const notation = element('clef', { number: 1, 'after-barline': isStart ? undefined : 'yes' }, [
    textElement('sign', sign),
    line !== undefined && textElement('line', line),
    line !== undefined && octaveChange !== 0 && textElement('clef-octave-change', octaveChange),
  ]);
  return isStart ? [notation, element('clef', { number: 2 }, [textElement('sign', 'TAB')])] : [notation];
}

/** writeTuning: the tab staff's strings, lowest first (line 1 is the bottom line), and the capo. */
function staffDetails(track: Track, keySignature: number): XmlNode {
  const count = track.strings.length;
  const lowestFirst = [...track.strings].sort((a, b) => b.number - a.number);
  return element('staff-details', { number: 2 }, [
    textElement('staff-type', 'alternate'),
    textElement('staff-lines', count),
    ...lowestFirst.map((string) => element('staff-tuning', { line: count - string.number + 1 }, pitchChildren(string.tuning, keySignature, 'tuning-'))),
    track.offset > 0 && textElement('capo', track.offset),
  ]);
}

function isSameTime(a: MeasureHeader, b: MeasureHeader): boolean {
  return a.timeSignature.numerator === b.timeSignature.numerator && a.timeSignature.denominator === b.timeSignature.denominator;
}

/**
 * `<attributes>` where the measure is the first or its key, time signature or clef changes; undefined elsewhere. The
 * divisions (TuxGuitar: 960) are a quarter note in `unit`s of ticks (tickUnit).
 */
export function attributesElement(context: Pick<PartContext, 'track' | 'unit' | 'transposition'>, measureIndex: number, headers: readonly MeasureHeader[]): XmlNode | undefined {
  const { track, unit } = context;
  const measure = track.measures[measureIndex];
  const header = headers[measureIndex];
  if (measure === undefined || header === undefined) {
    return undefined;
  }
  const previous = track.measures[measureIndex - 1];
  const previousHeader = headers[measureIndex - 1];
  const isStart = previous === undefined || previousHeader === undefined;
  const keyChanges = isStart || measure.keySignature !== previous.keySignature;
  const timeChanges = isStart || !isSameTime(header, previousHeader);
  const clefChanges = isStart || measure.clef !== previous.clef;
  if (!keyChanges && !timeChanges && !clefChanges) {
    return undefined;
  }
  return element('attributes', {}, [
    isStart && textElement('divisions', QUARTER_TIME / unit),
    keyChanges && element('key', {}, [textElement('fifths', measure.keySignature)]),
    timeChanges &&
      element('time', {}, [textElement('beats', header.timeSignature.numerator), textElement('beat-type', header.timeSignature.denominator)]),
    !track.isPercussion && textElement('staves', 2),
    !track.isPercussion && textElement('part-symbol', 'none'),
    ...(clefChanges ? clefElements(track, measure, isStart, context.transposition) : []),
    isStart && !track.isPercussion && staffDetails(track, measure.keySignature),
  ]);
}

/** The tempo (a metronome mark with its sound) where it changes, and the marker as a rehearsal mark. */
export function headerDirection(header: MeasureHeader, previous: MeasureHeader | undefined): XmlNode | undefined {
  const tempoChanges = previous === undefined || header.tempo !== previous.tempo;
  if (!tempoChanges && header.marker === undefined) {
    return undefined;
  }
  return element('direction', { placement: 'above' }, [
    tempoChanges &&
      element('direction-type', {}, [element('metronome', {}, [textElement('beat-unit', 'quarter'), textElement('per-minute', header.tempo)])]),
    header.marker !== undefined && element('direction-type', {}, [textElement('rehearsal', header.marker.title)]),
    tempoChanges && element('sound', { tempo: header.tempo }),
  ]);
}

const MAX_ENDING_BIT = 30;

/** generateAlternateEndingString: the endings a measure belongs to, "1,3" for endings 1 and 3. */
function endingNumbers(header: MeasureHeader | undefined): string {
  if (header === undefined || header.repeatAlternative === 0) {
    return '';
  }
  return Array.from({ length: MAX_ENDING_BIT + 1 }, (_, bit) => bit)
    .filter((bit) => (header.repeatAlternative & (1 << bit)) !== 0)
    .map((bit) => bit + 1)
    .join(',');
}

/** The barline at the measure's start: an ending that starts here and a forward repeat. */
export function leftBarline(header: MeasureHeader, previous: MeasureHeader | undefined): XmlNode | undefined {
  const endings = endingNumbers(header);
  const isEndingStart = endings !== '' && endings !== endingNumbers(previous);
  if (!isEndingStart && !header.repeatOpen) {
    return undefined;
  }
  return element('barline', { location: 'left' }, [
    header.repeatOpen && textElement('bar-style', 'heavy-light'),
    isEndingStart && textElement('ending', endings, { number: endings, type: 'start' }),
    header.repeatOpen && element('repeat', { direction: 'forward' }),
  ]);
}

/**
 * The barline at the measure's end: an ending that stops here (closed by the repeat, else left open) and a backward
 * repeat. TuxGuitar's repeat count is the number of repeats; MusicXML's `times` counts every pass.
 */
export function rightBarline(header: MeasureHeader, next: MeasureHeader | undefined): XmlNode | undefined {
  const endings = endingNumbers(header);
  const isEndingStop = endings !== '' && endings !== endingNumbers(next);
  const isRepeatClose = header.repeatClose > 0;
  if (!isEndingStop && !isRepeatClose) {
    return undefined;
  }
  return element('barline', { location: 'right' }, [
    isRepeatClose && textElement('bar-style', 'light-heavy'),
    isEndingStop && textElement('ending', endings, { number: endings, type: isRepeatClose ? 'stop' : 'discontinue' }),
    isRepeatClose && element('repeat', { direction: 'backward', times: header.repeatClose + 1 }),
  ]);
}
