import { describe, expect, it } from 'vitest';
import { GpFormatError } from '../src';
import { PT_ACTIVE_SYMBOL, PT_DIRECTION, type PtBar, type PtBeat, type PtComponent, type PtDirection, type PtSong } from '../src/formats/ptb/ptb-model';
import { MAX_SYNCHRONIZED_COMPONENTS, synchronizeSong } from '../src/formats/ptb/ptb-synchronizer';

const D = PT_DIRECTION;
const { DC, DS, DSS } = PT_ACTIVE_SYMBOL;

/** A beat labelled by its duration field, which the synchronizer does not look at. */
function beat(label: number): PtBeat {
  return {
    kind: 'beat',
    staff: 0,
    voice: 0,
    multiBarRest: 1,
    duration: label,
    enters: 1,
    times: 1,
    dotted: false,
    doubleDotted: false,
    vibrato: false,
    grace: false,
    arpeggioUp: false,
    arpeggioDown: false,
    notes: [],
  };
}

function bar(repeatStart: boolean, repeatClose = 0): PtBar {
  return { kind: 'bar', repeatStart, repeatClose, numerator: 4, denominator: 4 };
}

function direction(value: number, activeSymbol = 0, repeat = 0): PtDirection {
  return { kind: 'direction', direction: value, activeSymbol, repeat };
}

function ending(endNumber: number): PtComponent {
  return { kind: 'symbol', endNumber };
}

/** One section per entry, one position per inner entry (numbered in order). */
function songOf(sections: readonly (readonly (readonly PtComponent[])[])[]): PtSong {
  const track = {
    infos: [],
    sections: sections.map((positions, number) => ({ number, staffs: 1, positions: positions.map((components, position) => ({ position, components })) })),
  };
  const info = { name: '', interpret: '', album: '', author: '', lyricist: '', arranger: '', guitarTranscriber: '', bassTranscriber: '', copyright: '', guitarInstructions: '', bassInstructions: '', instructions: '' };
  return { info, track1: track, track2: { infos: [], sections: [] } };
}

/** The beat labels of the played-out guitar score, in order. */
function playOrder(sections: readonly (readonly (readonly PtComponent[])[])[]): number[] {
  const played = synchronizeSong(songOf(sections)).track1;
  return played.sections.flatMap((section) => section.positions.flatMap((position) => position.components.flatMap((c) => (c.kind === 'beat' ? [c.duration] : []))));
}

describe('Power Tab synchronizer: repeats and endings', () => {
  it('keeps a score without repeats as it is, positions in order and directions last', () => {
    // Arrange
    const song = songOf([[[beat(1)], [direction(D.CODA), beat(2)]]]);
    const shuffled: PtSong = { ...song, track1: { ...song.track1, sections: song.track1.sections.map((section) => ({ ...section, positions: [...section.positions].reverse() })) } };

    // Act
    const played = synchronizeSong(shuffled).track1;

    // Assert
    expect(played.sections[0]?.positions.map((position) => position.components.map((component) => component.kind))).toEqual([['beat'], ['beat', 'direction']]);
  });

  it('plays a repeat the number of times its closing bar says', () => {
    expect(playOrder([[[bar(true), beat(1)], [beat(2), bar(false, 3)], [beat(3)]]])).toEqual([1, 2, 1, 2, 1, 2, 3]);
  });

  it('plays the first ending on the first pass and skips it on the second', () => {
    // Arrange: |: 1 | [1. 2 :| [2. 3 |
    const score = [[[bar(true), beat(1)], [ending(0b01), beat(2), bar(false, 2)], [ending(0b10), beat(3)]]];

    // Act
    const order = playOrder(score);

    // Assert
    expect(order).toEqual([1, 2, 1, 3]);
  });

  it('ignores a closing bar without a repeat start', () => {
    expect(playOrder([[[beat(1)], [beat(2), bar(false, 2)]]])).toEqual([1, 2]);
  });
});

describe('Power Tab synchronizer: directions', () => {
  it('plays D.C. al Fine: back to the start, then up to the Fine', () => {
    expect(playOrder([[[beat(1)], [beat(2), direction(D.FINE, DC)], [beat(3), direction(D.DA_CAPO_AL_FINE)]]])).toEqual([1, 2, 3, 1, 2]);
  });

  it('plays D.S. al Coda: back to the segno, then from To Coda to the coda', () => {
    // Arrange
    const score = [
      [[beat(1)], [beat(2), direction(D.SEGNO)], [beat(3), direction(D.TO_CODA, DS)], [beat(4), direction(D.DAL_SEGNO_AL_CODA)], [beat(5), direction(D.CODA)]],
    ];

    // Act
    const order = playOrder(score);

    // Assert
    expect(order).toEqual([1, 2, 3, 4, 2, 3, 5]);
  });

  it.each([
    ['D.C.', [[[beat(1)], [beat(2), direction(D.DA_CAPO)]]], [1, 2, 1, 2]],
    ['D.S.', [[[beat(1)], [beat(2), direction(D.SEGNO)], [beat(3), direction(D.DAL_SEGNO)]]], [1, 2, 3, 2, 3]],
    ['D.S.S.', [[[beat(1), direction(D.SEGNO_SEGNO)], [beat(2), direction(D.DAL_SEGNO_SEGNO)]]], [1, 2, 1, 2]],
    [
      'D.C. al Double Coda',
      [[[beat(1)], [beat(2), direction(D.TO_DOUBLE_CODA, DC)], [beat(3), direction(D.DA_CAPO_AL_DOUBLE_CODA)], [beat(4), direction(D.DOUBLE_CODA)]]],
      [1, 2, 3, 1, 2, 4],
    ],
    [
      'D.C. al Coda',
      [[[beat(1)], [beat(2), direction(D.TO_CODA, DC)], [beat(3), direction(D.DA_CAPO_AL_CODA)], [beat(4), direction(D.CODA)]]],
      [1, 2, 3, 1, 2, 4],
    ],
    [
      'D.S. al Double Coda',
      [[[beat(1), direction(D.SEGNO)], [beat(2), direction(D.TO_DOUBLE_CODA, DS)], [beat(3), direction(D.DAL_SEGNO_AL_DOUBLE_CODA)], [beat(4), direction(D.DOUBLE_CODA)]]],
      [1, 2, 3, 1, 2, 4],
    ],
    [
      'D.S.S. al Coda',
      [[[beat(1), direction(D.SEGNO_SEGNO)], [beat(2), direction(D.TO_CODA, DSS)], [beat(3), direction(D.DAL_SEGNO_SEGNO_AL_CODA)], [beat(4), direction(D.CODA)]]],
      [1, 2, 3, 1, 2, 4],
    ],
    [
      'D.S.S. al Double Coda',
      [[[beat(1), direction(D.SEGNO_SEGNO)], [beat(2), direction(D.TO_DOUBLE_CODA, DSS)], [beat(3), direction(D.DAL_SEGNO_SEGNO_AL_DOUBLE_CODA)], [beat(4), direction(D.DOUBLE_CODA)]]],
      [1, 2, 3, 1, 2, 4],
    ],
    ['D.S. al Fine', [[[beat(1), direction(D.SEGNO)], [beat(2), direction(D.FINE, DS)], [beat(3), direction(D.DAL_SEGNO_AL_FINE)]]], [1, 2, 3, 1, 2]],
    ['D.S.S. al Fine', [[[beat(1), direction(D.SEGNO_SEGNO)], [beat(2), direction(D.FINE, DSS)], [beat(3), direction(D.DAL_SEGNO_SEGNO_AL_FINE)]]], [1, 2, 3, 1, 2]],
  ] as const)('plays %s', (_name, score, order) => {
    expect(playOrder(score)).toEqual(order);
  });

  it('jumps across sections and stops at a Fine reached on the way', () => {
    expect(playOrder([[[beat(1)], [beat(2), direction(D.FINE, DC)]], [[beat(3), direction(D.DA_CAPO_AL_FINE)]]])).toEqual([1, 2, 3, 1, 2]);
  });

  it('uses each jump once', () => {
    expect(playOrder([[[beat(1)], [beat(2), direction(D.DA_CAPO), direction(D.DA_CAPO)]]])).toEqual([1, 2, 1, 2, 1, 2]);
  });

  it('goes on when a D.S. finds no segno, or a Fine was already used', () => {
    expect(playOrder([[[beat(1)], [beat(2), direction(D.DAL_SEGNO)]]])).toEqual([1, 2]);
    expect(playOrder([[[beat(1)], [beat(2), direction(D.FINE)], [beat(3), direction(D.DA_CAPO)]]])).toEqual([1, 2]);
  });

  it('takes a direction meant for a repeat pass only on that pass', () => {
    // Arrange: |: 1 [Fine on pass 2] 2 :| 3
    const score = [[[bar(true), beat(1), direction(D.FINE, 0, 2)], [beat(2), bar(false, 2)], [beat(3)]]];

    // Act
    const order = playOrder(score);

    // Assert
    expect(order).toEqual([1, 2, 1]);
  });

  it('ignores unknown directions', () => {
    expect(playOrder([[[beat(1), direction(99)], [beat(2)]]])).toEqual([1, 2]);
  });

  it('rejects repeats and jumps that would play without end', () => {
    // Arrange: many bars that each repeat 31 times
    const positions = Array.from({ length: MAX_SYNCHRONIZED_COMPONENTS / 40 }, () => [bar(true), beat(1), bar(false, 31)]);

    // Act
    const play = (): unknown => synchronizeSong(songOf([positions]));

    // Assert
    expect(play).toThrow(GpFormatError);
  });
});
