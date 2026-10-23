// GPIF `<MasterTrack>` and `<MasterBars>` (no TuxGuitar counterpart): the inverse of the reader's readMasterBar / buildHeaders.
import { roundTempo } from '../../model/defaults';
import type { MeasureHeader, Song, TripletFeel } from '../../model/song';
import { directionsNode } from './gpif-marks';
import { type XmlNode, xmlCdata, xmlElement, xmlText } from './xml-writer';

/** Alternate endings the reader takes: 1–31 (bits 0–30). */
const MAX_ALTERNATE_ENDING = 31;
/** Tempo automations give quarter notes per minute, decimals kept ("92.5 2": reference 2 = quarter note). */
const QUARTER_REFERENCE = 2;

const TRIPLET_FEELS: Readonly<Record<TripletFeel, string | undefined>> = { none: undefined, eighth: 'Triplet8th', sixteenth: 'Triplet16th' };

function automationNode(type: string, barIndex: number, value: string): XmlNode {
  return xmlElement('Automation', [
    xmlText('Type', type),
    xmlText('Linear', 'false'),
    xmlText('Bar', barIndex),
    xmlText('Position', 0),
    xmlText('Visible', 'true'),
    xmlText('Value', value),
  ]);
}

function tempoOf(header: MeasureHeader): number {
  return Math.max(1, roundTempo(header.tempo));
}

/** A tempo automation on the first bar and on every bar whose tempo differs from the bar before. */
function tempoAutomations(song: Song): readonly XmlNode[] {
  return song.measureHeaders.flatMap((header, index) => {
    const previous = song.measureHeaders[index - 1];
    const isChange = previous === undefined || tempoOf(previous) !== tempoOf(header);
    return isChange ? [automationNode('Tempo', index, `${tempoOf(header)} ${QUARTER_REFERENCE}`)] : [];
  });
}

/** `<MasterTrack>`: the track order, an anacrusis, and the tempo automations. */
export function masterTrackNode(song: Song, isAnacrusis: boolean): XmlNode {
  return xmlElement('MasterTrack', [
    isAnacrusis && xmlElement('Anacrusis'),
    xmlText('Tracks', song.tracks.map((_, index) => index).join(' ')),
    xmlElement('Automations', tempoAutomations(song)),
  ]);
}

function alternateEndingsOf(mask: number): readonly number[] {
  return Array.from({ length: MAX_ALTERNATE_ENDING }, (_, bit) => bit + 1).filter((ending) => (mask & (1 << (ending - 1))) !== 0);
}

function repeatNode(header: MeasureHeader): XmlNode | undefined {
  const isEnd = header.repeatClose > 0;
  if (!header.repeatOpen && !isEnd) {
    return undefined;
  }
  // The reader reads count - 1 as the model's repeat count.
  return xmlElement('Repeat', [], { start: String(header.repeatOpen), end: String(isEnd), count: isEnd ? header.repeatClose + 1 : 0 });
}

function masterBarNode(header: MeasureHeader, keySignature: number, barIds: readonly number[]): XmlNode {
  const endings = alternateEndingsOf(header.repeatAlternative);
  const feel = TRIPLET_FEELS[header.tripletFeel];
  return xmlElement('MasterBar', [
    // The model has no major / minor mode; TransposeAs is how Guitar Pro spells transposed notes.
    xmlElement('Key', [
      xmlText('AccidentalCount', keySignature),
      xmlText('Mode', 'Major'),
      xmlText('TransposeAs', keySignature < 0 ? 'Flats' : 'Sharps'),
    ]),
    xmlText('Time', `${header.timeSignature.numerator}/${header.timeSignature.denominator}`),
    directionsNode(header),
    header.marker !== undefined && xmlElement('Section', [xmlCdata('Letter', ''), xmlCdata('Text', header.marker.title)]),
    repeatNode(header),
    endings.length > 0 && xmlText('AlternateEndings', endings.join(' ')),
    feel !== undefined && xmlText('TripletFeel', feel),
    xmlText('Bars', barIds.join(' ')),
  ]);
}

/** `<MasterBars>`: one per measure header, with the key the song's first pitched track has there. */
export function masterBarsNode(song: Song, keySignatures: readonly number[], barIds: readonly (readonly number[])[]): XmlNode {
  return xmlElement(
    'MasterBars',
    song.measureHeaders.map((header, index) => masterBarNode(header, keySignatures[index] ?? 0, barIds[index] ?? [])),
  );
}
