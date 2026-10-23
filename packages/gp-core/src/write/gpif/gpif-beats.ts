// GPIF `<Beat>` elements (no TuxGuitar counterpart): the inverse of the reader's readBeat and beat-level effects.
import { XPROPERTY_BRUSH_DURATION } from '../../formats/gpif/gpif-read-beat';
import { DEFAULT_VELOCITY } from '../../formats/common/velocity';
import type { Beat, Bend, Duration, Grace, Note, StrokeDirection, Voice, VoiceDirection } from '../../model/song';
import { whammyCurveOf } from './gpif-curves';
import { faddingOf, hairpinNode, rasgueadoProperty } from './gpif-marks';
import { flagProperty, intXProperty, property } from './gpif-properties';
import { brushTicksOf, dynamicNameOf, tremoloPickingOf } from './gpif-units';
import { type XmlChild, type XmlNode, xmlCdata, xmlElement, xmlText } from './xml-writer';

/** Dynamic of a rest (Guitar Pro's default). */
const REST_DYNAMIC = 'MF';

/**
 * What GPIF keeps per beat of a voice although the model has it per note: the reader gives every note of the voice the
 * beat's dynamic, whammy bar, tremolo picking, slap, pop and fade in. The first note decides the dynamic, the first
 * note that has one the whammy bar and tremolo picking; slap, pop and fade in are on when a note has them.
 */
interface VoiceEffects {
  readonly velocity: number;
  readonly tremoloBar: Bend | undefined;
  readonly tremoloPicking: Duration | undefined;
  readonly isSlapped: boolean;
  readonly isPopped: boolean;
  /** FadeIn, FadeOut or VolumeSwell (`faddingOf`). */
  readonly fadding: string | undefined;
}

function voiceEffectsOf(notes: readonly Note[]): VoiceEffects {
  return {
    velocity: notes[0]?.velocity ?? DEFAULT_VELOCITY,
    tremoloBar: notes.find((note) => note.effect.tremoloBar !== undefined)?.effect.tremoloBar,
    tremoloPicking: notes.find((note) => note.effect.tremoloPicking !== undefined)?.effect.tremoloPicking?.duration,
    isSlapped: notes.some((note) => note.effect.slapping),
    isPopped: notes.some((note) => note.effect.popping),
    fadding: faddingOf(notes),
  };
}

/** The grace that a voice's grace beat takes its duration, dynamic and placement from: the first note's that has one. */
export function voiceGraceOf(voice: Voice): Grace | undefined {
  return voice.notes.find((note) => note.effect.grace !== undefined)?.effect.grace;
}

const STEM_NAMES: Readonly<Record<VoiceDirection, string | undefined>> = { none: undefined, up: 'Upward', down: 'Downward' };
const DIRECTION_NAMES: Readonly<Record<StrokeDirection, string | undefined>> = { none: undefined, up: 'Up', down: 'Down' };

function whammyNode(tremoloBar: Bend): XmlNode {
  const curve = whammyCurveOf(tremoloBar);
  return xmlElement('Whammy', [], {
    originValue: curve.originValue,
    middleValue: curve.middleValue,
    destinationValue: curve.destinationValue,
    originOffset: curve.originOffset,
    middleOffset1: curve.middleOffset1,
    middleOffset2: curve.middleOffset2,
    destinationOffset: curve.destinationOffset,
  });
}

function stemNodes(direction: VoiceDirection): readonly XmlChild[] {
  const stem = STEM_NAMES[direction];
  return stem === undefined ? [] : [xmlText('TransposedPitchStemOrientation', stem), xmlText('UserTransposedPitchStemOrientation', stem)];
}

/** What a beat carries once, on the first voice written for it: stroke, pick stroke, chord, text, hairpin and rasgueado. */
export interface BeatCarrier {
  readonly beat: Beat;
  readonly chordId: number | undefined;
}

function beatProperties(effects: VoiceEffects, carrier: BeatCarrier | undefined): readonly XmlChild[] {
  const brush = carrier === undefined ? undefined : DIRECTION_NAMES[carrier.beat.stroke.direction];
  const pick = carrier === undefined ? undefined : DIRECTION_NAMES[carrier.beat.pickStroke];
  return [
    brush !== undefined && property('Brush', 'Direction', brush),
    pick !== undefined && property('PickStroke', 'Direction', pick),
    effects.isPopped && flagProperty('Popped'),
    effects.isSlapped && flagProperty('Slapped'),
    rasgueadoProperty(carrier?.beat.rasgueado),
  ];
}

function beatXProperties(carrier: BeatCarrier | undefined): readonly XmlChild[] {
  const stroke = carrier?.beat.stroke;
  const hasBrush = stroke !== undefined && stroke.direction !== 'none' && stroke.value > 0;
  return [hasBrush && intXProperty(XPROPERTY_BRUSH_DURATION, brushTicksOf(stroke.value))];
}

function group(name: string, children: readonly XmlChild[]): XmlChild {
  return children.some((child) => child !== undefined && child !== false) && xmlElement(name, children);
}

/** What `beatNode` builds a beat element from: equal keys give equal elements. */
export function beatNodeKey(voice: Voice, rhythmId: number, noteIds: readonly number[], carrier: BeatCarrier | undefined): string {
  const beat = carrier?.beat;
  const carried = beat === undefined ? undefined : [beat.stroke, beat.pickStroke, beat.text, carrier?.chordId, beat.hairpin, beat.rasgueado];
  return JSON.stringify([rhythmId, noteIds, voice.direction, voice.notes.length === 0, voiceEffectsOf(voice.notes), carried]);
}

/** A beat of a voice: its rhythm, notes and the effects GPIF keeps per beat. */
export function beatNode(id: number, voice: Voice, rhythmId: number, noteIds: readonly number[], carrier: BeatCarrier | undefined): XmlNode {
  const effects = voiceEffectsOf(voice.notes);
  const text = carrier?.beat.text;
  return xmlElement(
    'Beat',
    [
      xmlText('Dynamic', voice.notes.length === 0 ? REST_DYNAMIC : dynamicNameOf(effects.velocity)),
      xmlElement('Rhythm', [], { ref: rhythmId }),
      ...stemNodes(voice.direction),
      xmlText('ConcertPitchStemOrientation', 'Undefined'),
      carrier?.chordId !== undefined && xmlText('Chord', carrier.chordId),
      effects.tremoloPicking !== undefined && xmlText('Tremolo', tremoloPickingOf(effects.tremoloPicking)),
      effects.fadding !== undefined && xmlText('Fadding', effects.fadding),
      hairpinNode(carrier?.beat.hairpin),
      effects.tremoloBar !== undefined && whammyNode(effects.tremoloBar),
      text !== undefined && text !== '' && xmlCdata('FreeText', text),
      noteIds.length > 0 && xmlText('Notes', noteIds.join(' ')),
      group('Properties', beatProperties(effects, carrier)),
      group('XProperties', beatXProperties(carrier)),
    ],
    { id },
  );
}

/** A rest filling a gap in a voice. */
export function restBeatNode(id: number, rhythmId: number): XmlNode {
  return xmlElement('Beat', [
    xmlText('Dynamic', REST_DYNAMIC),
    xmlElement('Rhythm', [], { ref: rhythmId }),
    xmlText('ConcertPitchStemOrientation', 'Undefined'),
  ], { id });
}

/** What `graceBeatNode` builds a grace beat from. */
export function graceBeatNodeKey(grace: Grace, rhythmId: number, noteIds: readonly number[]): string {
  return JSON.stringify(['grace', grace.onBeat, dynamicNameOf(grace.velocity), rhythmId, noteIds]);
}

/** The grace beat before a beat: Guitar Pro keeps grace notes on a beat of their own. */
export function graceBeatNode(id: number, grace: Grace, rhythmId: number, noteIds: readonly number[]): XmlNode {
  return xmlElement(
    'Beat',
    [
      xmlText('GraceNotes', grace.onBeat ? 'OnBeat' : 'BeforeBeat'),
      xmlText('Dynamic', dynamicNameOf(grace.velocity)),
      xmlElement('Rhythm', [], { ref: rhythmId }),
      xmlText('ConcertPitchStemOrientation', 'Undefined'),
      xmlText('Notes', noteIds.join(' ')),
    ],
    { id },
  );
}
