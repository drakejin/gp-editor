// GPIF `<Track>` elements (no TuxGuitar counterpart): the inverse of the reader's readTracks / buildTracks.
import { DEFAULT_CHANNEL } from '../../model/defaults';
import type { Channel, Song, Track } from '../../model/song';
import type { TrackPlan } from './gpif-bars';
import { chordPropertiesOf } from './gpif-chords';
import { flagProperty, property } from './gpif-properties';
import { type MidiChannels, channelOf, instrumentSetOf, soundNameOf, tuningInstrumentOf } from './gpif-sounds';
import type { DrumElement } from './drum-kit';
import { type XmlNode, xmlCdata, xmlElement, xmlText } from './xml-writer';

const MAX_MIDI_VALUE = 127;
const BANK_BITS = 7;
const FRET_COUNT = 24;
/** RSE channel strip parameters (Guitar Pro's defaults); the reader takes 11 as pan and 12 as volume, 0–1. */
const CHANNEL_STRIP = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.795, 0.5, 0.5, 0.5] as const;
const CHANNEL_STRIP_BALANCE = 11;
const CHANNEL_STRIP_VOLUME = 12;
const LYRICS_LINES = 5;
const SOUND_ROLE = 'Factory';

/** A 0–127 MIDI value as a channel strip value 0–1 (six decimals, which the reader rounds back). */
function stripValueOf(value: number): string {
  return (Math.min(MAX_MIDI_VALUE, Math.max(0, value)) / MAX_MIDI_VALUE).toFixed(6);
}

function channelStripNode(channel: Channel): XmlNode {
  const parameters = CHANNEL_STRIP.map((value, index) => {
    if (index === CHANNEL_STRIP_BALANCE) {
      return stripValueOf(channel.balance);
    }
    return index === CHANNEL_STRIP_VOLUME ? stripValueOf(channel.volume) : String(value);
  });
  return xmlElement('RSE', [xmlElement('ChannelStrip', [xmlText('Parameters', parameters.join(' '))], { version: 'E56' })]);
}

function articulationNode(articulation: DrumElement['articulations'][number]): XmlNode {
  return xmlElement('Articulation', [
    xmlText('Name', articulation.name),
    xmlText('StaffLine', articulation.staffLine),
    xmlText('Noteheads', articulation.noteheads),
    xmlText('TechniquePlacement', articulation.techniquePlacement),
    xmlText('TechniqueSymbol', articulation.techniqueSymbol),
    xmlText('InputMidiNumbers', articulation.inputMidi),
    xmlText('OutputRSESound', articulation.outputRseSound),
    xmlText('OutputMidiNumber', articulation.outputMidi),
  ]);
}

/** A pitched instrument's single element, as Guitar Pro writes it. */
const PITCHED_ELEMENT: DrumElement = {
  name: 'Pitched',
  type: 'pitched',
  soundbankName: '',
  articulations: [
    {
      name: '',
      staffLine: 0,
      noteheads: 'noteheadBlack noteheadHalf noteheadWhole',
      techniquePlacement: 'outside',
      techniqueSymbol: '',
      inputMidi: 0,
      outputRseSound: '',
      outputMidi: 0,
    },
  ],
};

function elementNode(element: DrumElement): XmlNode {
  return xmlElement('Element', [
    xmlText('Name', element.name),
    xmlText('Type', element.type),
    xmlText('SoundbankName', element.soundbankName),
    xmlElement('Articulations', element.articulations.map(articulationNode)),
  ]);
}

function instrumentSetNode(program: number, plan: TrackPlan): XmlNode {
  const set = instrumentSetOf(program, plan.noteContext.isPercussion);
  const elements = plan.noteContext.isPercussion ? plan.noteContext.drumKit : [PITCHED_ELEMENT];
  return xmlElement('InstrumentSet', [
    xmlText('Name', set.name),
    xmlText('Type', set.type),
    xmlText('LineCount', 5),
    xmlElement('Elements', elements.map((element) => elementNode(element))),
  ]);
}

/** The track's sound: `<Sounds>` and the Sound automation that selects it at the start. */
function soundNodes(channel: Channel, isPercussion: boolean): readonly [XmlNode, XmlNode] {
  const program = isPercussion ? 0 : Math.min(MAX_MIDI_VALUE, Math.max(0, channel.program));
  const bank = isPercussion ? 0 : Math.max(0, channel.bank);
  const name = soundNameOf(program, isPercussion);
  const path = `Midi/${program}`;
  const sound = xmlElement('Sound', [
    xmlCdata('Name', name),
    xmlCdata('Label', name),
    xmlText('Path', path),
    xmlText('Role', SOUND_ROLE),
    xmlElement('MIDI', [xmlText('LSB', bank & MAX_MIDI_VALUE), xmlText('MSB', (bank >> BANK_BITS) & MAX_MIDI_VALUE), xmlText('Program', program)]),
  ]);
  const automation = xmlElement('Automation', [
    xmlText('Type', 'Sound'),
    xmlText('Linear', 'false'),
    xmlText('Bar', 0),
    xmlText('Position', 0),
    xmlText('Visible', 'true'),
    xmlCdata('Value', `${path};${name};${SOUND_ROLE}`),
  ]);
  return [xmlElement('Sounds', [sound]), xmlElement('Automations', [automation])];
}

/** Five lyrics lines; the model's lyrics on the first, left for Guitar Pro to place on the beats (not dispatched). */
function lyricsNode(track: Track): XmlNode {
  const lines = Array.from({ length: LYRICS_LINES }, (_, index) => {
    const lyrics = index === 0 ? track.lyrics : undefined;
    return xmlElement('Line', [xmlCdata('Text', lyrics?.text ?? ''), xmlText('Offset', lyrics === undefined ? 0 : lyrics.from - 1)]);
  });
  const isDispatched = track.lyrics === undefined || track.lyrics.text.trim() === '';
  return xmlElement('Lyrics', lines, { dispatched: String(isDispatched) });
}

function staffNode(plan: TrackPlan, program: number): XmlNode {
  const { track } = plan;
  const pitches = [...track.strings].reverse().map((string) => string.tuning);
  const tuning = xmlElement(
    'Property',
    [
      xmlText('Pitches', pitches.join(' ')),
      xmlText('Flat', ''),
      xmlText('Instrument', tuningInstrumentOf(program, plan.noteContext.isPercussion)),
      xmlCdata('Label', ''),
      xmlText('LabelVisible', 'false'),
    ],
    { name: 'Tuning' },
  );
  const properties = [
    property('CapoFret', 'Fret', track.offset),
    property('FretCount', 'Number', FRET_COUNT),
    property('PartialCapoFret', 'Fret', 0),
    property('PartialCapoStringFlags', 'Bitset', pitches.map(() => '0').join('')),
    tuning,
    ...chordPropertiesOf(track, plan.chordIds),
    flagProperty('TuningFlat'),
    xmlCdata('Name', ''),
  ];
  return xmlElement('Staves', [xmlElement('Staff', [xmlElement('Properties', properties)])]);
}

function playbackStateOf(track: Track): string {
  if (track.solo) {
    return 'Solo';
  }
  return track.mute ? 'Mute' : 'Default';
}

function trackNode(song: Song, plan: TrackPlan, index: number, midi: MidiChannels): XmlNode {
  const { track } = plan;
  const channel = channelOf(song, track) ?? { ...DEFAULT_CHANNEL, id: track.channelId };
  const isPercussion = plan.noteContext.isPercussion;
  const program = isPercussion ? 0 : channel.program;
  const set = instrumentSetOf(program, isPercussion);
  const [sounds, automations] = soundNodes(channel, isPercussion);
  return xmlElement(
    'Track',
    [
      xmlCdata('Name', track.name),
      xmlCdata('ShortName', track.name),
      xmlText('Color', `${track.color.r} ${track.color.g} ${track.color.b}`),
      xmlText('SystemsDefautLayout', 3), // sic: Guitar Pro's spelling
      xmlText('SystemsLayout', 3),
      xmlElement('AutoBrush'),
      xmlText('PalmMute', 0.3),
      xmlText('AutoAccentuation', 0.2),
      xmlText('PlayingStyle', set.isStringed ? 'StringedPick' : 'Default'),
      xmlElement('UseOneChannelPerString'),
      xmlText('IconId', set.iconId),
      instrumentSetNode(program, plan),
      xmlElement('Transpose', [xmlText('Chromatic', 0), xmlText('Octave', 0)]),
      channelStripNode(channel),
      xmlText('ForcedSound', -1),
      sounds,
      xmlElement('MidiConnection', [
        xmlText('Port', 0),
        xmlText('PrimaryChannel', midi.primary),
        xmlText('SecondaryChannel', midi.secondary),
        xmlText('ForeOneChannelPerString', 'false'), // sic
      ]),
      xmlText('PlaybackState', playbackStateOf(track)),
      xmlText('AudioEngineState', 'MIDI'),
      lyricsNode(track),
      staffNode(plan, program),
      automations,
    ],
    { id: index },
  );
}

/** `<Tracks>`: one track per song track, each with a single staff. */
export function tracksNode(song: Song, plans: readonly TrackPlan[], midiChannels: ReadonlyMap<number, MidiChannels>): XmlNode {
  return xmlElement(
    'Tracks',
    plans.map((plan, index) => trackNode(song, plan, index, midiChannels.get(plan.track.channelId) ?? { primary: 0, secondary: 0 })),
  );
}
