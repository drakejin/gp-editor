// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentReader (LGPL-2.1).
import { GpFormatError } from '../../errors';
import { decodeUtf8Lenient } from '../../io/text';
import {
  type GpifBar,
  type GpifDocument,
  type GpifMasterBar,
  type GpifRhythm,
  type GpifScore,
  type GpifVersion,
  type GpifVoice,
  indexById,
} from './gpif-document';
import { readAutomation } from './gpif-automation';
import { readBeat, readNote } from './gpif-read-beat';
import { readTracks } from './gpif-read-track';
import { type XmlElement, attribute, child, childList, childText, children, parseIntList, parseJavaInt, parseXml } from './xml';

const ROOT_ELEMENT = 'GPIF';

/** Parse a GPIF document (UTF-8 bytes or text) into the intermediate document. */
export function readGpifDocument(input: Uint8Array | string, version: GpifVersion): GpifDocument {
  const root = parseXml(typeof input === 'string' ? input : decodeUtf8Lenient(input));
  if (root.name !== ROOT_ELEMENT) {
    throw new GpFormatError(`Invalid GPIF document: root element is <${root.name}>, expected <${ROOT_ELEMENT}>`);
  }
  return {
    version,
    gpVersion: nonEmpty(childText(root, 'GPVersion')),
    gpRevision: nonEmpty(childText(root, 'GPRevision')),
    score: readScore(child(root, 'Score')),
    automations: childList(child(root, 'MasterTrack'), 'Automations', 'Automation').map(readAutomation),
    tracks: readTracks(root, version),
    masterBars: childList(root, 'MasterBars', 'MasterBar').map(readMasterBar),
    bars: indexById(childList(root, 'Bars', 'Bar').map(readBar)),
    voices: indexById(childList(root, 'Voices', 'Voice').map(readVoice)),
    beats: indexById(childList(root, 'Beats', 'Beat').map(readBeat)),
    notes: indexById(childList(root, 'Notes', 'Note').map(readNote)),
    rhythms: indexById(childList(root, 'Rhythms', 'Rhythm').map(readRhythm)),
  };
}

function nonEmpty(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function readScore(score: XmlElement | undefined): GpifScore {
  const text = (name: string): string => childText(score, name) ?? '';
  return {
    title: text('Title'),
    subTitle: text('SubTitle'),
    artist: text('Artist'),
    album: text('Album'),
    words: text('Words'),
    music: text('Music'),
    wordsAndMusic: text('WordsAndMusic'),
    copyright: text('Copyright'),
    tabber: text('Tabber'),
    instructions: text('Instructions'),
    notices: text('Notices'),
  };
}

function readMasterBar(node: XmlElement): GpifMasterBar {
  const repeat = child(node, 'Repeat');
  const key = child(node, 'Key');
  const section = child(node, 'Section');
  const directions = child(node, 'Directions');
  const repeatEnds = attribute(repeat, 'end') === 'true';
  return {
    barIds: parseIntList(childText(node, 'Bars'), ' ') ?? [],
    time: parseIntList(childText(node, 'Time'), '/'),
    repeatStart: attribute(repeat, 'start') === 'true',
    repeatCount: repeatEnds ? Math.max(0, parseJavaInt(attribute(repeat, 'count'), 0) - 1) : 0,
    accidentalCount: parseJavaInt(childText(key, 'AccidentalCount'), 0),
    mode: childText(key, 'Mode'),
    tripletFeel: childText(node, 'TripletFeel'),
    alternateEndings: parseIntList(childText(node, 'AlternateEndings'), ' '),
    markerText: childText(section, 'Text')?.replaceAll('\n', '').trim(),
    directionTargets: children(directions, 'Target').map((target) => target.text),
    directionJumps: children(directions, 'Jump').map((jump) => jump.text),
  };
}

function readBar(node: XmlElement): GpifBar {
  return {
    id: parseJavaInt(attribute(node, 'id'), 0),
    voiceIds: parseIntList(childText(node, 'Voices'), ' ') ?? [],
    clef: childText(node, 'Clef'),
    simileMark: childText(node, 'SimileMark'),
  };
}

function readVoice(node: XmlElement): GpifVoice {
  return {
    id: parseJavaInt(attribute(node, 'id'), 0),
    beatIds: parseIntList(childText(node, 'Beats'), ' ') ?? [],
  };
}

function readRhythm(node: XmlElement): GpifRhythm {
  const tuplet = child(node, 'PrimaryTuplet');
  const secondary = child(node, 'SecondaryTuplet');
  const dot = child(node, 'AugmentationDot');
  return {
    id: parseJavaInt(attribute(node, 'id'), 0),
    noteValue: childText(node, 'NoteValue'),
    augmentationDotCount: dot === undefined ? 0 : parseJavaInt(attribute(dot, 'count'), 0),
    primaryTupletNum: tuplet === undefined ? 1 : parseJavaInt(attribute(tuplet, 'num'), 0),
    primaryTupletDen: tuplet === undefined ? 1 : parseJavaInt(attribute(tuplet, 'den'), 0),
    secondaryTupletNum: secondary === undefined ? 1 : parseJavaInt(attribute(secondary, 'num'), 0),
    secondaryTupletDen: secondary === undefined ? 1 : parseJavaInt(attribute(secondary, 'den'), 0),
  };
}
