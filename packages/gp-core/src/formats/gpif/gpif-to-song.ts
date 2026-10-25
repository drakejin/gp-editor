// Port of TuxGuitar app.tuxguitar.io.gpx.GPXDocumentParser (LGPL-2.1).
import { normalizeBeamGrouping, parseBeamGrouping } from '../../model/beaming';
import { FOUR_FOUR, RED, isNoteValue, measureTicks, roundTempo } from '../../model/defaults';
import {
  type MeasureHeader,
  type MusicalDirection,
  QUARTER_TIME,
  type Song,
  type SongInfo,
  type SourceInfo,
  type TimeSignature,
  type TripletFeel,
} from '../../model/song';
import { directionFromGpif, sortDirections } from '../common/directions';
import type { GpifAutomation, GpifDocument, GpifMasterBar, GpifScore } from './gpif-document';
import { buildGpifAudioTrack } from './gpif-audio-track';
import { buildMeasure } from './gpif-measure';
import { buildTracks } from './gpif-song-tracks';
import type { TrackView } from './part-configuration';

const DEFAULT_TEMPO = 120;
const MAX_ALTERNATE_ENDING = 31;

/** Build the song model from a GPIF document and, when the container has one, its PartConfiguration's track views. */
export function gpifToSong(doc: GpifDocument, source: SourceInfo, trackViews: readonly TrackView[] = []): Song {
  const headers = buildHeaders(doc);
  const built = buildTracks(doc, (layout) =>
    headers.map((header, index) => buildMeasure(doc, header, index, layout)),
  );
  const tracks = built.tracks.map((track, index) => (trackViews[index]?.hasSlash === true ? { ...track, hasSlashNotation: true } : track));
  const audioTrack = buildGpifAudioTrack(doc.audioTrack);
  return { source, info: buildInfo(doc.score), channels: built.channels, measureHeaders: headers, tracks, ...(audioTrack === undefined ? {} : { audioTrack }) };
}

/**
 * GPXDocumentParser#parseScore, extended to every SongInfo field. WordsAndMusic fills Words and
 * Music when they are empty (TuxGuitar only keeps it as the author).
 */
function buildInfo(score: GpifScore): SongInfo {
  const notices = score.notices.split(/\r?\n/);
  return {
    title: score.title,
    subtitle: score.subTitle,
    artist: score.artist,
    album: score.album,
    words: score.words === '' ? score.wordsAndMusic : score.words,
    music: score.music === '' ? score.wordsAndMusic : score.music,
    copyright: score.copyright,
    transcriber: score.tabber,
    instructions: score.instructions,
    notice: notices.length === 1 && notices[0] === '' ? [] : notices,
  };
}

function buildHeaders(doc: GpifDocument): MeasureHeader[] {
  const tempos = tempoPerBar(doc.automations, doc.masterBars.length);
  const headers: MeasureHeader[] = [];
  let start = QUARTER_TIME;
  doc.masterBars.forEach((masterBar, index) => {
    const header = buildHeader(masterBar, index, start, tempos[index] ?? DEFAULT_TEMPO);
    headers.push(header);
    start += measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
  });
  return headers;
}

function buildHeader(masterBar: GpifMasterBar, index: number, start: number, tempo: number): MeasureHeader {
  const marker = masterBar.markerText;
  const timeSignature = timeSignatureOf(masterBar.time);
  const grouping = masterBar.beamUnit === undefined ? undefined : parseBeamGrouping(masterBar.beamUnit, masterBar.beamGroups);
  const beamGrouping = normalizeBeamGrouping(grouping, timeSignature);
  const directions = directionsOf(masterBar);
  return {
    number: index + 1,
    start,
    timeSignature,
    tempo,
    ...(marker === undefined || marker === '' ? {} : { marker: { title: marker, color: RED } }),
    repeatOpen: masterBar.repeatStart,
    repeatClose: masterBar.repeatCount,
    repeatAlternative: alternativeMask(masterBar.alternateEndings),
    tripletFeel: tripletFeelOf(masterBar.tripletFeel),
    ...(beamGrouping === undefined ? {} : { beamGrouping }),
    ...(directions.length === 0 ? {} : { directions }),
  };
}

/** `<Directions>`: the known targets and jumps, each once, in GP5's order. */
function directionsOf(masterBar: GpifMasterBar): readonly MusicalDirection[] {
  const targets = masterBar.directionTargets.map((name) => directionFromGpif(name, 'target'));
  const jumps = masterBar.directionJumps.map((name) => directionFromGpif(name, 'jump'));
  return sortDirections([...targets, ...jumps].filter((direction): direction is MusicalDirection => direction !== undefined));
}

function timeSignatureOf(time: readonly number[] | undefined): TimeSignature {
  const numerator = time?.[0];
  const denominator = time?.[1];
  if (time?.length !== 2 || numerator === undefined || denominator === undefined) {
    return FOUR_FOUR;
  }
  return numerator > 0 && isNoteValue(denominator) ? { numerator, denominator } : FOUR_FOUR;
}

/** Alternate endings "1 3" → bits 0 and 2. Endings outside 1–31 are ignored. */
function alternativeMask(endings: readonly number[] | undefined): number {
  return (endings ?? [])
    .filter((ending) => ending >= 1 && ending <= MAX_ALTERNATE_ENDING)
    .reduce((mask, ending) => mask | (1 << (ending - 1)), 0);
}

function tripletFeelOf(feel: string | undefined): TripletFeel {
  if (feel === 'Triplet8th') {
    return 'eighth';
  }
  return feel === 'Triplet16th' ? 'sixteenth' : 'none';
}

/**
 * Tempo of every bar. A bar with tempo automations takes the first one (as TuxGuitar does); a bar
 * without keeps the tempo in effect at the end of the previous bars (TuxGuitar would repeat the
 * first automation of the last bar that had one, losing mid-bar changes).
 */
function tempoPerBar(automations: readonly GpifAutomation[], barCount: number): number[] {
  const byBar = new Map<number, TempoChange[]>();
  for (const automation of automations) {
    const tempo = tempoOf(automation);
    if (tempo !== undefined) {
      byBar.set(automation.barId, [...(byBar.get(automation.barId) ?? []), { position: automation.position, tempo }]);
    }
  }
  const result: number[] = [];
  let current = DEFAULT_TEMPO;
  for (let bar = 0; bar < barCount; bar++) {
    const changes = byBar.get(bar) ?? [];
    result.push(changes[0]?.tempo ?? current);
    current = lastChange(changes)?.tempo ?? current;
  }
  return result;
}

interface TempoChange {
  readonly position: number;
  readonly tempo: number;
}

/** The change with the highest position in the bar (the later one on ties). */
function lastChange(changes: readonly TempoChange[]): TempoChange | undefined {
  return changes.reduce<TempoChange | undefined>(
    (latest, change) => (latest === undefined || change.position >= latest.position ? change : latest),
    undefined,
  );
}

/** Quarter notes per minute of a Tempo automation "value reference"; undefined when not usable. */
function tempoOf(automation: GpifAutomation): number | undefined {
  if (automation.type !== 'Tempo' || automation.value?.length !== 2) {
    return undefined;
  }
  const [value = 0, reference = 0] = automation.value;
  const tempo = convertTempo(value, reference);
  return tempo > 0 ? tempo : undefined;
}

/** Beats of each reference in quarter notes: 1 = eighth, 2 = quarter, 3 = dotted quarter, 4 = half, 5 = dotted half. */
const REFERENCE_QUARTERS: Readonly<Record<number, number>> = { 1: 0.5, 2: 1, 3: 1.5, 4: 2, 5: 3 };

/** Quarter notes per minute of `value` beats of `reference` per minute, to two decimals (unknown reference: quarters). */
function convertTempo(value: number, reference: number): number {
  return roundTempo(value * (REFERENCE_QUARTERS[reference] ?? 1));
}
