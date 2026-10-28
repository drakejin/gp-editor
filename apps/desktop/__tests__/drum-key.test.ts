import { DRUM_KIT_NOTATIONS, type Song } from '@gp-editor/core';
import {
  WHOLE_KIT_KEYS,
  drumEntryDetail,
  drumEntryName,
  drumGroupName,
  drumKeyGroups,
  drumKeyRows,
  labelWidth,
  drumVariantName,
  trackDrumKeys,
} from '../src/lib/drum-key';
import { layoutDrumKey } from '../src/lib/drum-key-layout';
import { isMessageKey, setLanguage } from '../src/lib/i18n/i18n';
import { DRUM_KEY_STAFF } from '../src/score/drum-key-staff';
import { beat, makeSong, note } from '../test-support/songs';

function drumSong(): Song {
  const song = makeSong([
    [beat(960, [note(1, 42), note(2, 36)]), beat(1920, [note(1, 46), note(2, 38, { grace: { fret: 37, duration: 3, velocity: 95, transition: 'none', onBeat: false, isDead: false } })])],
    [beat(4800, [note(1, 49), note(2, 27)])],
  ]);
  return { ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion: true })) };
}

const keysOf = (groups: ReturnType<typeof drumKeyGroups>) => groups.map((group) => [group.id, group.entries.map((entry) => entry.key)]);

afterEach(() => setLanguage('en'));

describe('trackDrumKeys', () => {
  it('lists every key the track plays, grace notes too, once each', () => {
    expect(trackDrumKeys(drumSong().tracks[0]!)).toEqual([27, 36, 37, 38, 42, 46, 49]);
  });
});

describe('drumKeyGroups', () => {
  it('groups the drums by element type in kit order, low to high, keys the kit lacks last', () => {
    // Act
    const groups = drumKeyGroups([49, 46, 38, 27, 36, 42, 37]);

    // Assert
    expect(keysOf(groups)).toEqual([
      ['kickDrum', [36]],
      ['snare', [38, 37]],
      ['hiHat', [42, 46]],
      ['crash', [49]],
      ['other', [27]],
    ]);
  });

  it('orders an element type’s drums from the lowest on the staff up, then by the kit', () => {
    // Guitar Pro's kit writes the low floor tom (41) on the low tom's line (45), after it in the kit.
    expect(keysOf(drumKeyGroups([50, 41, 45, 43, 48, 47]))).toEqual([['tom', [43, 45, 41, 47, 48, 50]]]);
    expect(keysOf(drumKeyGroups([44, 46, 92, 42]))).toEqual([['hiHat', [42, 92, 46, 44]]]);
    expect(keysOf(drumKeyGroups([57, 49, 98, 97]))).toEqual([['crash', [57, 98, 49, 97]]]);
  });

  it('shows the whole kit in every group once', () => {
    // Act
    const groups = drumKeyGroups(WHOLE_KIT_KEYS);

    // Assert
    expect(groups.flatMap((group) => group.entries.map((entry) => entry.key)).sort((a, b) => a - b)).toEqual(
      DRUM_KIT_NOTATIONS.map((notation) => notation.key).sort((a, b) => a - b),
    );
    expect(groups.slice(0, 10).map((group) => group.id)).toEqual(['kickDrum', 'snare', 'handClap', 'hiHat', 'tom', 'crash', 'ride', 'china', 'splash', 'cowbell']);
  });
});

describe('drum key names', () => {
  it('names every group and every drum of the kit in both languages', () => {
    const groups = drumKeyGroups(WHOLE_KIT_KEYS);

    expect(groups.filter((group) => !isMessageKey(`drums.group.${group.id}`)).map((group) => group.id)).toEqual([]);
    expect(WHOLE_KIT_KEYS.filter((key) => !isMessageKey(`drums.variant.${key}`))).toEqual([]);
  });

  it('names a drum by its column and its variant', () => {
    // Arrange
    const [hiHat] = drumKeyGroups([46]);

    // Act / Assert
    expect(drumGroupName('hiHat')).toBe('Hi-Hat');
    expect(drumVariantName(hiHat!.entries[0]!)).toBe('Open');
    expect(drumEntryName(hiHat!, hiHat!.entries[0]!)).toBe('Hi-Hat · Open');
    setLanguage('ko');
    expect(drumEntryName(hiHat!, hiHat!.entries[0]!)).toBe('하이햇 · 오픈');
  });

  it('gives the key and the General MIDI sound it plays', () => {
    const entry = (key: number) => drumKeyGroups([key])[0]!.entries[0]!;

    expect(drumEntryDetail(entry(42))).toBe('General MIDI key 42: Closed Hi-Hat');
    expect(drumEntryDetail(entry(92))).toBe("Guitar Pro's key 92, played as General MIDI 46: Open Hi-Hat");
    expect(drumEntryDetail(entry(27))).toBe("Key 27: not in Guitar Pro's drum kit, written on the middle line");
    expect(drumEntryDetail(entry(73))).toContain('written on the middle line (Guitar Pro writes it far off the staff)');
    expect(drumVariantName(entry(27))).toBe('Key 27');
  });
});

describe('labelWidth', () => {
  it('counts Hangul a whole em and other characters about six tenths of one', () => {
    expect(labelWidth('탐탐', 10)).toBe(20);
    expect(labelWidth('Toms', 10)).toBeCloseTo(24.8, 5);
  });
});

describe('drumKeyRows', () => {
  it('fills rows with whole groups up to the width', () => {
    // Arrange: groups 1, 2, 4 and 1 drums wide, 10 points a drum, 5 between groups.
    const groups = drumKeyGroups([36, 38, 37, 42, 46, 92, 44, 49]);

    // Act
    const rows = drumKeyRows(groups, { maxWidth: 40, gap: 5, widthOf: (group) => group.entries.length * 10 });

    // Assert
    expect(rows.map((row) => row.map((group) => group.id))).toEqual([['kickDrum', 'snare'], ['hiHat'], ['crash']]);
  });

  it('puts a group wider than the row on a row of its own', () => {
    const rows = drumKeyRows(drumKeyGroups([36, 42, 46, 92, 44]), { maxWidth: 25, gap: 5, widthOf: (group) => group.entries.length * 10 });

    expect(rows.map((row) => row.map((group) => group.id))).toEqual([['kickDrum'], ['hiHat']]);
  });
});

describe('layoutDrumKey', () => {
  it('widens a one-drum column for its name and gives each row the staff height its drums need', () => {
    // Arrange: Tambourine is one drum; the low bongo sits high above the staff.
    const groups = drumKeyGroups([54, 36, 61]);

    // Act
    const rows = layoutDrumKey(groups, 200);

    // Assert
    const tambourine = rows.flatMap((row) => row.columns).find((column) => column.group.id === 'tambourine')!;
    expect(tambourine.width).toBeGreaterThan(DRUM_KEY_STAFF.column);
    expect(rows.map((row) => row.columns.map((column) => column.group.id))).toEqual([['kickDrum', 'tambourine'], ['bongo']]);
    expect(rows[1]!.box.top).toBeGreaterThan(rows[0]!.box.top);
  });
});
