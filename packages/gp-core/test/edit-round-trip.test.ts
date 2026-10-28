import { describe, expect, it } from 'vitest';
import type { BeatAddress, StringAddress } from '../src/edit/addresses';
import { setBeatPickStroke, setBeatStroke, setBeatText } from '../src/edit/beat-attributes';
import { deleteBeatNotes } from '../src/edit/beats';
import { findNote, setNoteFret, setNoteVelocity } from '../src/edit/edit-song';
import { BEND_SHAPES, buildBend } from '../src/edit/bend-shapes';
import { CURVE_VALUE_RANGES, addCurvePoint, curveFromPoints, moveCurvePoint, normalizeCurvePoints, removeCurvePoint } from '../src/edit/curve-points';
import { BEND_PRESETS, TREMOLO_BAR_PRESETS, buildHarmonic, setNoteBend, setNoteHarmonic, setNoteTremoloBar, setNoteVibrato } from '../src/edit/effects';
import { setMeasureMarker, setRepeat, setTripletFeel } from '../src/edit/measure-headers';
import { setNoteGrace, setNoteTremoloPicking, setNoteTrill } from '../src/edit/ornaments';
import { setSongInfo } from '../src/edit/song-info';
import { setTrackCapo, setTrackName } from '../src/edit/track-properties';
import { setTrackBalance, setTrackMute, setTrackSolo, setTrackVolume } from '../src/edit/track-sound';
import { TUPLET_SIZES, plainDuration, tupletOf } from '../src/model/defaults';
import type { Bend, BendPoint, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { writeSong } from '../src/write';
import { canGpifHoldCurve, toGpifCurve } from '../src/write/gpif/gpif-curves';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp5 } from './helpers/write-expected';
import { expectedAfterGp } from './helpers/write-expected-gpif';
import { buildNote, buildSong, buildVoice, restVoice } from './helpers/write-song-builder';

/*
 * Every field the palette edits set survives a GP5 save, or is reduced the documented way (write-expected.ts):
 * the read-back song equals the edited song as GP5 holds it.
 */

function saveAndRead(edited: Song): Song {
  const again = readSong(writeSong(edited, 'gp5'));
  expect(songDifference(expectedAfterGp5(edited, again), again)).toBeUndefined();
  return again;
}

/** Two guitar tracks of three 4/4 bars; bar 1 of track 1 holds four quarter notes on strings 1 and 2. */
function makeSong(): Song {
  const quarter = (fret: number) => ({ voice: buildVoice([buildNote(1, fret), buildNote(2, fret + 2)]) });
  return buildSong({
    tracks: [
      { measures: [[quarter(5), quarter(7), quarter(9), quarter(10)], [{ voice: restVoice(plainDuration(1)) }], [{ voice: restVoice(plainDuration(1)) }]] },
      { measures: [[{ voice: buildVoice([buildNote(3, 0)], plainDuration(1)) }], [], []] },
    ],
  });
}

const AT: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 1 };
const beatAt = (beatIndex: number): StringAddress => ({ ...AT, beatIndex });
const BEAT: BeatAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0 };

describe('GP5 round trip of the palette edits', () => {
  it('keeps the note edits: dynamics, grace notes, trills, tremolo picking, tremolo bar, bends and harmonics', () => {
    // Arrange
    let song = makeSong();
    song = setNoteVelocity(song, AT, 47);
    song = setNoteGrace(song, AT, { fret: 3, duration: 2, velocity: 79, transition: 'hammer', onBeat: true, isDead: false });
    song = setNoteTrill(song, { ...AT, string: 2 }, { fret: 9, duration: plainDuration(64) });
    song = setNoteTremoloPicking(song, beatAt(1), { duration: plainDuration(32) });
    song = setNoteTremoloBar(song, beatAt(2), TREMOLO_BAR_PRESETS.releaseUp);
    song = setNoteBend(song, beatAt(3), BEND_PRESETS.bendReleaseBend);
    song = setNoteBend(song, { ...beatAt(3), string: 2 }, BEND_PRESETS.preBendRelease);
    song = setNoteHarmonic(song, beatAt(1), buildHarmonic('tapped', 7));
    song = setNoteHarmonic(song, { ...beatAt(1), string: 2 }, buildHarmonic('artificial', 9));

    // Act
    const again = saveAndRead(song);

    // Assert
    expect(findNote(again, AT)).toMatchObject({ velocity: 47, effect: { grace: { fret: 3, onBeat: true } } });
    expect(findNote(again, { ...AT, string: 2 })?.effect.trill).toEqual({ fret: 9, duration: plainDuration(64) });
    expect(findNote(again, beatAt(1))?.effect).toMatchObject({ tremoloPicking: { duration: plainDuration(32) }, harmonic: { type: 'tapped', data: 19 } });
    expect(findNote(again, beatAt(2))?.effect.tremoloBar).toEqual(TREMOLO_BAR_PRESETS.releaseUp);
    expect(findNote(again, beatAt(3))?.effect.bend).toEqual(BEND_PRESETS.bendReleaseBend);
  });

  it.each(Object.entries(TREMOLO_BAR_PRESETS))('keeps the %s tremolo bar preset', (_name, tremoloBar) => {
    const again = saveAndRead(setNoteTremoloBar(makeSong(), AT, tremoloBar));
    expect(findNote(again, AT)?.effect.tremoloBar).toEqual(tremoloBar);
  });

  it.each(Object.entries(BEND_PRESETS))('keeps the %s bend preset', (_name, bend) => {
    const again = saveAndRead(setNoteBend(makeSong(), AT, bend));
    expect(findNote(again, AT)?.effect.bend).toEqual(bend);
  });

  it.each(BEND_SHAPES)('keeps the %s bend shape at every amount', (shape) => {
    // Arrange
    const bends = [1, 3, 12].map((amount) => buildBend(shape, amount));
    const song = bends.reduce((edited, bend, beatIndex) => setNoteBend(edited, beatAt(beatIndex), bend), makeSong());

    // Act
    const again = saveAndRead(song);

    // Assert
    expect(bends.map((_bend, beatIndex) => findNote(again, beatAt(beatIndex))?.effect.bend)).toEqual(bends);
  });

  it('keeps slight vibrato per note and wide vibrato per beat', () => {
    // Arrange
    const song = setNoteVibrato(setNoteVibrato(makeSong(), AT, 'wide'), beatAt(1), 'slight');

    // Act
    const again = saveAndRead(song);

    // Assert
    expect([findNote(again, AT), findNote(again, { ...AT, string: 2 })].map((note) => note?.effect.wideVibrato)).toEqual([true, true]);
    expect([findNote(again, beatAt(1)), findNote(again, { ...beatAt(1), string: 2 })].map((note) => note?.effect.vibrato)).toEqual([true, false]);
  });

  it('keeps the beat edits: stroke, pick stroke, text and a beat made a rest', () => {
    // Arrange
    let song = makeSong();
    song = setBeatStroke(song, BEAT, { direction: 'down', value: 16 });
    song = setBeatPickStroke(song, { ...BEAT, beatIndex: 1 }, 'up');
    song = setBeatText(song, { ...BEAT, beatIndex: 2 }, 'let ring');
    song = deleteBeatNotes(song, { ...BEAT, beatIndex: 3 });

    // Act
    const beats = saveAndRead(song).tracks[0]?.measures[0]?.beats;

    // Assert
    expect(beats?.map((beat) => [beat.stroke.direction, beat.pickStroke, beat.text ?? '', beat.voices[0]?.notes.length])).toEqual([
      ['down', 'none', '', 2],
      ['none', 'up', '', 2],
      ['none', 'none', 'let ring', 2],
      ['none', 'none', '', 0],
    ]);
  });

  it.each(TUPLET_SIZES)('keeps a tuplet of %i sixteenths', (size) => {
    // Arrange
    const tuplet = tupletOf(size);
    const duration = { ...plainDuration(16), tuplet: tuplet ?? plainDuration(16).tuplet };
    const song = buildSong({ tracks: [{ measures: [Array.from({ length: size }, () => ({ voice: buildVoice([buildNote(1, 0)], duration) }))] }] });

    // Act
    const again = saveAndRead(song);

    // Assert
    expect(again.tracks[0]?.measures[0]?.beats[0]?.voices[0]?.duration.tuplet).toEqual(tuplet);
  });

  it('keeps the bar edits: marker, triplet feel, alternate endings and repeat count', () => {
    // Arrange
    let song = makeSong();
    song = setMeasureMarker(song, 0, { title: 'Verse', color: { r: 255, g: 0, b: 0 } });
    song = setTripletFeel(song, 1, 'sixteenth');
    song = setRepeat(song, 1, { repeatClose: 3, repeatAlternative: 0b1000_0001 });

    // Act
    const headers = saveAndRead(song).measureHeaders;

    // Assert
    expect(headers[0]?.marker).toEqual({ title: 'Verse', color: { r: 255, g: 0, b: 0 } });
    expect(headers.map((header) => header.tripletFeel)).toEqual(['none', 'sixteenth', 'sixteenth']);
    expect(headers[1]).toMatchObject({ repeatClose: 3, repeatAlternative: 0b1000_0001 });
  });

  it('keeps the track edits: name, mute, solo, capo, and volume and balance in 17 steps', () => {
    // Arrange
    let song = makeSong();
    song = setTrackName(song, 0, 'Lead');
    song = setTrackMute(song, 1, true);
    song = setTrackSolo(song, 0, true);
    song = setTrackCapo(song, 0, 3);
    song = setTrackVolume(song, 0, 87);
    song = setTrackBalance(song, 1, 20);

    // Act
    const again = saveAndRead(song);

    // Assert
    expect(again.tracks.map((track) => [track.name, track.mute, track.solo, track.offset])).toEqual([
      ['Lead', false, true, 3],
      ['Track 2', true, false, 0],
    ]);
    expect([again.channels[0]?.volume, again.channels[1]?.balance]).toEqual([87, 23]);
  });

  it('keeps a mixer value set on one of two tracks sharing a channel, on the copy that track gets', () => {
    // Arrange
    const base = makeSong();
    const shared: Song = { ...base, channels: base.channels.slice(0, 1), tracks: base.tracks.map((track) => ({ ...track, channelId: 1 })) };

    // Act
    const again = saveAndRead(setTrackVolume(shared, 1, 63));

    // Assert
    expect(again.tracks.map((track) => again.channels.find((channel) => channel.id === track.channelId)?.volume)).toEqual([127, 63]);
  });

  it('cannot keep a mixer value of one of two drum tracks: GP5 plays every drum track on MIDI channel 10', () => {
    // Arrange
    const base = buildSong({
      tracks: [
        { isPercussion: true, measures: [[{ voice: buildVoice([buildNote(1, 36)]) }]] },
        { isPercussion: true, measures: [[{ voice: buildVoice([buildNote(1, 42)]) }]] },
      ],
    });
    const shared: Song = { ...base, channels: base.channels.slice(0, 1), tracks: base.tracks.map((track) => ({ ...track, channelId: 1 })) };
    const edited = setTrackVolume(shared, 1, 63);

    // Act
    const again = readSong(writeSong(edited, 'gp5'));

    // Assert
    expect(edited.channels.map((channel) => channel.volume)).toEqual([127, 63]);
    expect(again.tracks.map((track) => again.channels.find((channel) => channel.id === track.channelId)?.volume)).toEqual([127, 127]);
  });

  it('keeps the song information', () => {
    // Arrange
    const song = setSongInfo(makeSong(), { title: 'Title', artist: 'Artist', album: 'Album', transcriber: 'Tab', notice: ['one', 'two'] });

    // Act
    const again = saveAndRead(song);

    // Assert
    expect(again.info).toMatchObject({ title: 'Title', artist: 'Artist', album: 'Album', transcriber: 'Tab', notice: ['one', 'two'] });
  });

  it('keeps a note typed into the second voice, with its rests', () => {
    // Arrange
    const song = setNoteFret(makeSong(), { ...beatAt(1), voiceIndex: 1, string: 4 }, 2);

    // Act
    const again = saveAndRead(song);

    // Assert
    expect(findNote(again, { ...beatAt(1), voiceIndex: 1, string: 4 })?.fret).toBe(2);
  });
});

describe('round trip of a curve edited point by point (the tremolo bar and bend panels)', () => {
  const WHAMMY = CURVE_VALUE_RANGES.tremoloBar;

  /** A dip changed by hand: a deeper first dip, a rise above the note, a second dip, then the first point taken out. */
  function handMadeWhammy(): Bend {
    let points: readonly BendPoint[] = TREMOLO_BAR_PRESETS.dip.points;
    points = addCurvePoint(points, { position: 3, value: -10 }, WHAMMY);
    points = moveCurvePoint(points, 2, { position: 7, value: 3 }, WHAMMY);
    points = addCurvePoint(points, { position: 10, value: -6 }, WHAMMY);
    points = addCurvePoint(points, { position: 1, value: 0 }, WHAMMY);
    points = removeCurvePoint(points, 1);
    return curveFromPoints(points) ?? TREMOLO_BAR_PRESETS.dip;
  }

  /** The tremolo bar as the editor sees it: one point per position. */
  function whammyAt(song: Song, at: StringAddress): readonly BendPoint[] {
    return normalizeCurvePoints(findNote(song, at)?.effect.tremoloBar?.points ?? [], WHAMMY);
  }

  function saveAndReadGp(edited: Song): Song {
    const again = readSong(writeSong(edited, 'gp'));
    expect(songDifference(expectedAfterGp(edited), again)).toBeUndefined();
    return again;
  }

  it('keeps every point of a hand-made tremolo bar in a .gp5 file', () => {
    // Arrange
    const whammy = handMadeWhammy();
    const song = setNoteTremoloBar(makeSong(), AT, whammy);

    // Act
    const again = saveAndRead(song);

    // Assert
    expect(whammy.points.map((point) => [point.position, point.value])).toEqual([[0, 0], [3, -10], [7, 3], [10, -6], [12, 0]]);
    expect(findNote(again, AT)?.effect.tremoloBar).toEqual(whammy);
  });

  it('keeps a hand-made tremolo bar of the shape Guitar Pro 7/8 holds in a .gp file', () => {
    // Arrange: dip from the third position, hold, then come back above the note.
    const whammy: Bend = { points: [{ position: 0, value: 0 }, { position: 3, value: 0 }, { position: 6, value: -6 }, { position: 9, value: -6 }, { position: 12, value: 2 }] };
    const song = setNoteTremoloBar(makeSong(), AT, whammy);

    // Act
    const again = saveAndReadGp(song);

    // Assert
    expect(canGpifHoldCurve('tremoloBar', whammy)).toBe(true);
    expect(whammyAt(again, AT)).toEqual(whammy.points);
  });

  it('reduces a hand-made tremolo bar a .gp file cannot hold the documented way (toGpifCurve)', () => {
    // Arrange
    const whammy = handMadeWhammy();

    // Act
    const again = saveAndReadGp(setNoteTremoloBar(makeSong(), AT, whammy));

    // Assert
    expect(canGpifHoldCurve('tremoloBar', whammy)).toBe(false);
    expect(findNote(again, AT)?.effect.tremoloBar).toEqual(toGpifCurve('tremoloBar', whammy));
    expect(whammyAt(again, AT).map((point) => [point.position, point.value])).toEqual([[0, 0], [3, -10], [12, 0]]);
  });

  it('keeps a hand-made bend in .gp5 and, when GPIF can hold it, in .gp', () => {
    // Arrange: a bend and release whose release stops at a quarter tone, its points moved by hand.
    const bend = curveFromPoints(moveCurvePoint(buildBend('bendRelease', 6).points, 3, { position: 10, value: 1 }, CURVE_VALUE_RANGES.bend));
    const song = setNoteBend(makeSong(), AT, bend);

    // Act
    const fromGp5 = saveAndRead(song);
    const fromGp = saveAndReadGp(song);

    // Assert
    expect(bend?.points.map((point) => [point.position, point.value])).toEqual([[0, 0], [3, 6], [6, 6], [10, 1], [12, 0]]);
    expect(findNote(fromGp5, AT)?.effect.bend).toEqual(bend);
    expect(canGpifHoldCurve('bend', bend ?? { points: [] })).toBe(false);
    expect(findNote(fromGp, AT)?.effect.bend).toEqual(bend === undefined ? undefined : toGpifCurve('bend', bend));
  });
});
