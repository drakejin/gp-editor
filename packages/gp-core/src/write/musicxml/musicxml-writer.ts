// Port of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLWriter#writeSong / #writeHeaders / #writePartList / #writeTrack (LGPL-2.1).
import { writtenTransposition } from '../../formats/common/instrument-sets';
import { UNROUTED, buildChannelRoutes } from '../../midi/channel-routes';
import type { Channel, Song, SongInfo, Track } from '../../model/song';
import type { PartContext } from './musicxml-beat';
import { tickUnit } from './musicxml-divisions';
import { buildTrackFlow } from './musicxml-flow';
import { buildTrackLyrics } from './musicxml-lyrics';
import { buildMeasure } from './musicxml-measure';
import { type XmlChild, type XmlNode, element, serializeXml, textElement } from './xml-text';

const MUSICXML_VERSION = '4.0';
const MUSICXML_DOCTYPE =
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">';
const SOFTWARE = 'GP Editor';

/** TuxGuitar falls back to MIDI channel 16 for a channel it could not route. */
const UNROUTED_MIDI_CHANNEL = 16;
const PERCUSSION_MIDI_CHANNEL = 10;
const MAX_MIDI_VALUE = 127;
/** MusicXML's volume is a percentage; its pan runs -90 (left) … 90 (right) for the MIDI range. */
const VOLUME_PERCENT = 100;
const PAN_DEGREES = 90;
const PAN_CENTRE = 64;

export function partId(track: Track): string {
  return `P${track.number}`;
}

function creator(type: string, name: string): XmlChild {
  return name !== '' && textElement('creator', name, { type });
}

/** writeHeaders: the title, and who wrote, sang and transcribed the song. */
function headerElements(info: SongInfo): XmlNode[] {
  return [
    element('work', {}, [textElement('work-title', info.title)]),
    element('identification', {}, [
      creator('composer', info.music),
      creator('lyricist', info.words),
      creator('artist', info.artist),
      info.copyright !== '' && textElement('rights', info.copyright),
      element('encoding', {}, [textElement('software', SOFTWARE), info.transcriber !== '' && textElement('encoder', info.transcriber)]),
    ]),
  ];
}

function percent(value: number): number {
  return Math.round((Math.max(0, Math.min(MAX_MIDI_VALUE, value)) / MAX_MIDI_VALUE) * VOLUME_PERCENT);
}

function pan(balance: number): number {
  return Math.round(((Math.max(0, Math.min(MAX_MIDI_VALUE, balance)) - PAN_CENTRE) / PAN_CENTRE) * PAN_DEGREES);
}

/** The drum keys a percussion track plays (its notes' frets, grace notes included), lowest first. */
function percussionKeys(track: Track): readonly number[] {
  const keys = new Set<number>();
  for (const measure of track.measures) {
    for (const beat of measure.beats) {
      for (const voice of beat.voices) {
        voice.notes.forEach((note) => {
          keys.add(note.fret);
          if (note.effect.grace !== undefined) {
            keys.add(note.effect.grace.fret);
          }
        });
      }
    }
  }
  return [...keys].filter((key) => key >= 0 && key <= MAX_MIDI_VALUE).sort((a, b) => a - b);
}

function percussionInstruments(track: Track, channel: Channel | undefined): XmlNode[] {
  const keys = percussionKeys(track);
  const id = (key: number): string => `${partId(track)}-I${key + 1}`;
  return [
    ...keys.map((key) => element('score-instrument', { id: id(key) }, [textElement('instrument-name', `${channel?.name ?? 'Drums'} ${key}`)])),
    ...keys.map((key) =>
      element('midi-instrument', { id: id(key) }, [
        textElement('midi-channel', PERCUSSION_MIDI_CHANNEL),
        textElement('midi-program', 1),
        textElement('midi-unpitched', key + 1),
        channel !== undefined && textElement('volume', percent(channel.volume)),
        channel !== undefined && textElement('pan', pan(channel.balance)),
      ]),
    ),
  ];
}

function melodicInstruments(track: Track, channel: Channel, midiChannel: number): XmlNode[] {
  const id = `${partId(track)}-I1`;
  return [
    element('score-instrument', { id }, [textElement('instrument-name', channel.name)]),
    element('midi-instrument', { id }, [
      textElement('midi-channel', midiChannel),
      channel.bank > 0 && textElement('midi-bank', channel.bank + 1),
      textElement('midi-program', channel.program + 1),
      textElement('volume', percent(channel.volume)),
      textElement('pan', pan(channel.balance)),
    ]),
  ];
}

/**
 * writePartList: a score-part per track, with its own short name as its abbreviation (not in TuxGuitar) and its
 * channel's instrument (one per drum key for percussion).
 */
function partList(song: Song): XmlNode {
  const routes = buildChannelRoutes(song.channels);
  return element(
    'part-list',
    {},
    song.tracks.map((track) => {
      const channel = song.channels.find((candidate) => candidate.id === track.channelId);
      const route = routes.get(track.channelId);
      const midiChannel = route === undefined || route.channel1 === UNROUTED ? UNROUTED_MIDI_CHANNEL : route.channel1 + 1;
      const instruments = track.isPercussion
        ? percussionInstruments(track, channel)
        : channel === undefined
          ? []
          : melodicInstruments(track, channel, midiChannel);
      const abbreviation = track.shortName === undefined ? [] : [textElement('part-abbreviation', track.shortName)];
      return element('score-part', { id: partId(track) }, [textElement('part-name', track.name), ...abbreviation, ...instruments]);
    }),
  );
}

/** A track without a channel is written as a guitar is, an octave above its sound. */
const GUITAR_TRANSPOSITION = 12;

function transpositionOf(song: Song, track: Track): number {
  const channel = song.channels.find((candidate) => candidate.id === track.channelId);
  const tuning = track.strings.map((guitarString) => guitarString.tuning);
  return channel === undefined ? GUITAR_TRANSPOSITION : writtenTransposition(channel.program, track.isPercussion || channel.isPercussion, tuning);
}

function partElement(song: Song, track: Track, unit: number): XmlNode {
  const transposition = transpositionOf(song, track);
  const context: PartContext = { track, partId: partId(track), flow: buildTrackFlow(track), lyrics: buildTrackLyrics(track), unit, transposition };
  return element(
    'part',
    { id: context.partId },
    track.measures.map((_, measureIndex) => buildMeasure(context, song.measureHeaders, measureIndex)),
  );
}

/**
 * The song as a MusicXML 4.0 score-partwise document, as TuxGuitar writes it: each track a part with a notation staff
 * (a guitar's or bass's sounding an octave below the written notes, writtenTransposition) and a tab staff (string and fret of every note); a percussion track has
 * one staff of unpitched notes. Beyond TuxGuitar: ties and slurs across bar lines, bends as relative steps and the
 * tremolo bar as bends with the bar, slides, vibrato, strokes as arpeggios, dynamics, tuplet brackets, grace notes,
 * tempo sounds, left and right barlines.
 * MusicXML has no place for: when in the note a bend or tremolo bar moves (read back as even steps), tapped, pinch and
 * semi-harmonics (written as artificial / plain harmonics), slapping, popping, fade-in, chord diagrams, a stroke's speed.
 *
 * @throws RangeError when the song has no measure or no track
 */
export function writeMusicXml(song: Song): string {
  if (song.measureHeaders.length === 0 || song.tracks.length === 0) {
    throw new RangeError('A MusicXML score needs at least one measure and one track');
  }
  const unit = tickUnit(song);
  const root = element('score-partwise', { version: MUSICXML_VERSION }, [
    ...headerElements(song.info),
    partList(song),
    ...song.tracks.map((track) => partElement(song, track, unit)),
  ]);
  return serializeXml(root, MUSICXML_DOCTYPE);
}
