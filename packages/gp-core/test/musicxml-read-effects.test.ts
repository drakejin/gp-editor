import { describe, expect, it } from 'vitest';
import { buildBend } from '../src/edit/bend-shapes';
import { DYNAMICS } from '../src/formats/common/velocity';
import type { Note } from '../src/model/song';
import { DIVISIONS_1, beatsOf, firstTrack, onePart, quarter, readXml, tabQuarter, voiceNotes } from './helpers/musicxml-snippets';

const TAB = '<attributes><divisions>1</divisions><clef><sign>TAB</sign></clef></attributes>';

/** Each beat's first note in voice 1. */
function firstNotes(xml: string): readonly (Note | undefined)[] {
  return voiceNotes(readXml(xml)).map((notes) => notes[0]);
}

describe('readMusicXml note effects', () => {
  it('reads hammer-ons, pull-offs and slides to the next note', () => {
    // Arrange
    const xml = onePart(
      TAB +
        tabQuarter('C4', 2, 1, '', '') .replace('</technical>', '<hammer-on type="start">H</hammer-on></technical>') +
        tabQuarter('D4', 2, 3).replace('</technical>', '<hammer-on type="stop"/><pull-off type="start">P</pull-off></technical>') +
        tabQuarter('C4', 2, 1, '<slide type="start"/><slur type="start"/>') +
        tabQuarter('D4', 2, 3, '<slide type="start"/>'),
    );

    // Act
    const notes = firstNotes(xml);

    // Assert
    expect(notes.map((note) => note?.effect.hammer)).toEqual([true, true, false, false]);
    expect(notes.map((note) => note?.effect.slides)).toEqual([[], [], ['legato'], ['shift']]);
  });

  it('reads bends as the curve of their steps, pre-bends and releases', () => {
    // Arrange
    const bend = (inner: string) => tabQuarter('E4', 1, 5).replace('</technical>', `${inner}</technical>`);
    const xml = onePart(
      TAB +
        bend('<bend><bend-alter>2</bend-alter></bend>') +
        bend('<bend><bend-alter>1</bend-alter></bend><bend><bend-alter>-1</bend-alter><release/></bend>') +
        bend('<bend><bend-alter>2</bend-alter><pre-bend/></bend><bend><bend-alter>-2</bend-alter><release/></bend>') +
        bend('<bend><bend-alter>-2</bend-alter><release/></bend>'),
    );

    // Act
    const bends = firstNotes(xml).map((note) => note?.effect.bend);

    // Assert
    expect(bends).toEqual([buildBend('bend', 4), buildBend('bendRelease', 2), buildBend('preBendRelease', 4), buildBend('release', 4)]);
  });

  it('reads harmonics, vibrato, palm mute, let ring, dead and ghost notes, articulations and tapping', () => {
    // Arrange
    const xml = onePart(
      TAB +
        tabQuarter('E4', 1, 12, '<technical><harmonic><natural/></harmonic></technical><ornaments><wavy-line type="start" smufl="wiggleVibratoWide"/></ornaments>') +
        tabQuarter('E4', 1, 7, '<technical><harmonic><artificial/></harmonic></technical><ornaments><wavy-line type="start"/></ornaments><tied type="let-ring"/>') +
        tabQuarter('E4', 1, 0, '<articulations><staccato/><accent/><falloff/></articulations>', '<notehead>x</notehead>').replace('</note>', '<play><mute>palm</mute></play></note>') +
        tabQuarter('E4', 1, 3, '<articulations><strong-accent/><scoop/></articulations><technical><tap/></technical>', '<notehead parentheses="yes">normal</notehead>'),
    );

    // Act
    const effects = firstNotes(xml).map((note) => note?.effect);

    // Assert
    expect(effects[0]).toMatchObject({ harmonic: { type: 'natural', data: 0 }, wideVibrato: true, vibrato: false });
    expect(effects[1]).toMatchObject({ harmonic: { type: 'artificial', data: 12 }, vibrato: true, letRing: true });
    expect(effects[2]).toMatchObject({ deadNote: true, palmMute: true, staccato: true, accentuatedNote: true, slides: ['outDownwards'] });
    expect(effects[3]).toMatchObject({ ghostNote: true, heavyAccentuatedNote: true, tapping: true, slides: ['intoFromBelow'] });
  });

  it('reads trills, tremolo picking and pick strokes', () => {
    // Arrange
    const xml = onePart(
      TAB +
        tabQuarter('E4', 1, 5, '<ornaments><trill-mark trill-step="whole" beats="4"/></ornaments>') +
        tabQuarter('E4', 1, 5, '<ornaments><tremolo type="single">2</tremolo></ornaments><technical><up-bow/></technical>'),
    );

    // Act
    const song = readXml(xml);

    // Assert
    const [trilled, tremolo] = voiceNotes(song).map((notes) => notes[0]);
    expect(trilled?.effect.trill).toEqual({ fret: 7, duration: { value: 16, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } } });
    expect(tremolo?.effect.tremoloPicking?.duration.value).toBe(16);
    expect(beatsOf(song)[1]?.pickStroke).toBe('up');
  });

  it('attaches a grace note to the note it leads into on the same string', () => {
    // Arrange
    const grace = '<note><grace slash="yes"/><pitch><step>E</step><octave>4</octave></pitch><voice>1</voice><type>32nd</type><notations><slur type="start"/></notations></note>';
    const xml = onePart(DIVISIONS_1 + grace + quarter('F#4', '<notations><slur type="stop"/></notations>'));

    // Act
    const [note] = voiceNotes(readXml(xml))[0] ?? [];

    // Assert
    expect(note).toMatchObject({ string: 1, fret: 2 });
    expect(note?.effect.grace).toEqual({ fret: 0, duration: 2, velocity: note?.velocity, transition: 'hammer', onBeat: false, isDead: false });
  });

  it('gives notes the velocity of the dynamic marked before them, a note dynamics attribute winning', () => {
    // Arrange
    const piano = '<direction><direction-type><dynamics><p/></dynamics></direction-type></direction>';
    const xml = onePart(DIVISIONS_1 + quarter('E4') + piano + quarter('E4') + quarter('E4', '', ' dynamics="50"'), quarter('E4'));

    // Act
    const song = readXml(xml);

    // Assert
    const velocities = [...voiceNotes(song, 0), ...voiceNotes(song, 1)].map((notes) => notes[0]?.velocity);
    const p = DYNAMICS.find((dynamic) => dynamic.name === 'p')?.velocity;
    expect(velocities).toEqual([95, p, 48, p]);
  });

  it('reads lyrics as one syllable per sung beat from their first measure, words joined by hyphens', () => {
    // Arrange
    const lyric = (syllabic: string, text: string) => `<lyric number="1"><syllabic>${syllabic}</syllabic><text>${text}</text></lyric>`;
    const xml = onePart(
      DIVISIONS_1 + '<note><rest/><duration>4</duration><voice>1</voice><type>whole</type></note>',
      quarter('E4', lyric('begin', 'Hel')) + quarter('E4', lyric('end', 'lo')) + quarter('E4') + quarter('E4', lyric('single', 'world')),
    );

    // Act
    const track = firstTrack(readXml(xml));

    // Assert
    expect(track.lyrics).toEqual({ from: 2, text: 'Hel- lo  world' });
  });

  it('gives the beat the text of a words direction, but not a palm-mute mark', () => {
    // Arrange
    const words = (text: string) => `<direction placement="above"><direction-type><words>${text}</words></direction-type></direction>`;
    const xml = onePart(DIVISIONS_1 + words('Intro') + quarter('E4') + words('P.M.') + quarter('E4'));

    // Act
    const beats = beatsOf(readXml(xml));

    // Assert
    expect(beats.map((beat) => beat.text)).toEqual(['Intro', undefined]);
  });
});
