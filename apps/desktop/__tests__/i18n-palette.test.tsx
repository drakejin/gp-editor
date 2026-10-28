import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { GM_DRUM_KEYS, type StringAddress } from '@gp-editor/core';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { EditionPalette } from '../src/components/palette/EditionPalette';
import { paletteGroups } from '../src/components/palette/palette-groups';
import { directionName } from '../src/components/palette/palette-marks';
import type { PaletteTool } from '../src/components/palette/palette-tools';
import { setLanguage } from '../src/lib/i18n/i18n';
import { drumPieceLabel, gmFamilyName, gmPercussionLabel, gmProgramName, trackInstrument, trackKindName, tuningName } from '../src/lib/instruments';
import { engraveDrumKit } from '../src/score/drum-kit';
import { SCORE_MODE_LABELS } from '../src/score/geometry';
import { staffLabel } from '../src/score/score-layout';
import { noNoteHint } from '../src/state/edit-hints';
import { describeTransposition, transpositionHint } from '../src/state/transposition';
import { lastTrackHint } from '../src/state/track-edits';
import { PALETTE, texts } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));

const allTools = (): readonly PaletteTool[] => paletteGroups().flatMap((group) => group.tools);

/** Faces that copy the score's marks or are numbers and symbols: the same in every language. */
const NOTATION_FACES = new Set(['P.M.', 'L.R.', 'H/P', 'W.bar', 'Rasg.', '( )', '(♯)', '/', '8va', '>', '1. 2.', 'A', '♪³', '⇄', '1–4', '↔', '1', '2', '3', '4', '✎']);

describe('the edition palette in Korean', () => {
  it('names the groups and word faces in Korean and keeps the score’s abbreviations', () => {
    // Arrange
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act
    const groups = paletteGroups();
    const faces = new Map(groups.flatMap((group) => group.tools).map((tool) => [tool.id, tool.face]));

    // Assert
    expect(groups.map((group) => group.title)).toEqual(['성부', '리듬', '주법', '아티큘레이션', '셈여림', '음표', '박', '마디']);
    expect([faces.get('bend'), faces.get('slide'), faces.get('dead'), faces.get('insertMeasure'), faces.get('stringUp'), faces.get('clef')]).toEqual(['벤딩', '슬라이드', '데드', '+마디', '줄 ↑', '음자리표']);
    expect([faces.get('deleteNotes'), faces.get('deleteMeasure')]).toEqual(['삭제', '−마디']);
    expect([faces.get('palmMute'), faces.get('letRing'), faces.get('hammer'), faces.get('whammy'), faces.get('rasgueado')]).toEqual(['P.M.', 'L.R.', 'H/P', 'W.bar', 'Rasg.']);
  });

  it('translates every tooltip and every word face, and keeps each key in its tooltip', () => {
    // Arrange
    const english = allTools();
    ReactTestRenderer.act(() => setLanguage('ko'));

    // Act
    const korean = allTools();

    // Assert
    const untranslated = korean.filter((tool, index) => tool.tooltip === english[index]?.tooltip || (tool.face === english[index]?.face && !NOTATION_FACES.has(tool.face) && tool.glyph === undefined));
    expect(untranslated.map((tool) => tool.id)).toEqual([]);
    expect(korean.filter((tool) => tool.key !== undefined).every((tool) => tool.tooltip.includes(`(${tool.key})`))).toBe(true);
  });

  it('rebuilds the groups when the language changes, keeping their ids', () => {
    const english = paletteGroups();
    ReactTestRenderer.act(() => setLanguage('ko'));
    const korean = paletteGroups();

    expect(korean).not.toBe(english);
    expect(korean.map((group) => group.id)).toEqual(english.map((group) => group.id));
  });

  it('shows the palette in Korean and sets a long Hangul face smaller beside its key', () => {
    // Arrange
    const song = makeSong([[beat(960, [note(2, 5)])]]);
    const cursor: StringAddress = { trackIndex: 0, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string: 2 };
    ReactTestRenderer.act(() => setLanguage('ko'));
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    // Act
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<EditionPalette palette={PALETTE} song={song} cursor={cursor} onEdit={jest.fn()} onAction={jest.fn()} onOpenPanel={jest.fn()} />);
    });

    // Assert
    const shown = renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
    expect(shown).toEqual(expect.arrayContaining(['주법', '셈여림', '박자', '템포']));
    const slide = renderer.root.findAllByType(ChromeButton).find((button) => button.props.testID === 'palette-slide');
    const slideFace = slide?.findAllByType(Text).find((text) => text.props.children === '슬라이드');
    expect([slideFace?.props.style].flat(2)).toEqual(expect.arrayContaining([expect.objectContaining({ fontSize: 9 })]));
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('keeps the directions’ names and translates what they do', () => {
    ReactTestRenderer.act(() => setLanguage('ko'));

    expect(directionName('daSegnoAlCoda')).toEqual(['D.S. al Coda', 'D.S. al Coda: 세뇨로 돌아가 연주하다가 Da Coda에서 코다로 넘어갑니다']);
    expect(directionName('segno')[0]).toBe('Segno');
  });
});

describe('the editor’s hints in Korean', () => {
  it('says why an edit did nothing', () => {
    ReactTestRenderer.act(() => setLanguage('ko'));

    expect(noNoteHint(3)).toBe('커서의 3번 줄에 음이 없습니다: 먼저 프렛(0–9)을 입력하세요.');
    expect(lastTrackHint()).toBe('곡에는 트랙이 하나 이상 있어야 합니다: 이 트랙을 지우기 전에 다른 트랙을 추가하세요.');
  });

  it('says how far and what moved after a transposition', () => {
    ReactTestRenderer.act(() => setLanguage('ko'));

    expect(describeTransposition({ mode: 'chromatic', amount: -1 })).toBe('1반음 아래로');
    expect(describeTransposition({ mode: 'diatonic', amount: 0, octaves: 2 })).toBe('2옥타브 위로');
    expect(transpositionHint({ song: makeSong([[]]), moved: 24, unplaced: 1, chords: 3, unplacedChords: 0 }, { mode: 'chromatic', amount: 2 })).toBe(
      '음표 24개를 2반음 위로 조옮김했습니다. 코드 3개도 함께 옮겼습니다. 음표 1개는 새 음높이에서 지판에 맞지 않아 그대로 두었습니다.',
    );
  });
});

describe('instrument, drum and tuning names', () => {
  it('names General MIDI programs, families and drums in the shown language', () => {
    expect([gmProgramName(30), gmFamilyName(3), gmPercussionLabel(60), gmProgramName(200)]).toEqual(['Distortion Electric Guitar', 'Guitar', 'Hi Bongo', 'Program 201']);
    ReactTestRenderer.act(() => setLanguage('ko'));
    expect([gmProgramName(30), gmProgramName(24), gmFamilyName(3), gmPercussionLabel(60), gmPercussionLabel(20), gmProgramName(200)]).toEqual([
      '디스토션 기타',
      '어쿠스틱 기타 (나일론)',
      '기타',
      '하이 봉고',
      undefined,
      '프로그램 201',
    ]);
  });

  it('names track kinds and tunings, keeping tunings written with note names', () => {
    ReactTestRenderer.act(() => setLanguage('ko'));

    expect([trackKindName('guitar'), trackKindName('other')]).toEqual(['기타', '다른 악기']);
    expect([tuningName({ id: 'guitar-standard', name: 'Standard' }), tuningName({ id: 'guitar-drop-d', name: 'Drop D' }), tuningName({ id: 'unknown', name: 'Mine' })]).toEqual(['표준', 'Drop D', 'Mine']);
  });

  it('calls a track’s instrument by its Korean name', () => {
    const song = { ...makeSong([[]]), channels: [{ id: 1, name: 'Lead', program: 30, bank: 0, volume: 127, balance: 64, chorus: 0, reverb: 0, phaser: 0, tremolo: 0, isPercussion: false }] };
    ReactTestRenderer.act(() => setLanguage('ko'));

    expect(trackInstrument(song, 0)?.name).toBe('디스토션 기타');
  });

  it('labels the drum kit in Korean, with the drums it has no piece for', () => {
    ReactTestRenderer.act(() => setLanguage('ko'));

    const labels = texts(engraveDrumKit({ width: 900, keys: [GM_DRUM_KEYS.bassDrum, 60], palette: PALETTE })).map((text) => text.text);

    expect(labels).toEqual(expect.arrayContaining(['킥', '스네어', '하이햇', '라이드', '그 밖에: 하이 봉고']));
    expect(drumPieceLabel('unknown')).toBe('unknown');
  });
});

describe('the score’s view names and labels', () => {
  it('reads the view names in the shown language', () => {
    expect(SCORE_MODE_LABELS.notationAndTab).toBe('Score + Tab');
    ReactTestRenderer.act(() => setLanguage('ko'));
    expect([SCORE_MODE_LABELS.notationAndTab, SCORE_MODE_LABELS.notation, SCORE_MODE_LABELS.tab]).toEqual(['오선보 + 타브', '오선보', '타브']);
  });

  it('labels an unnamed track’s staff in the shown language', () => {
    ReactTestRenderer.act(() => setLanguage('ko'));

    expect(staffLabel({ name: ' ', number: 2 }, true)).toBe('트랙 2');
  });
});
