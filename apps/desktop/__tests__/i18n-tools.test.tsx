import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CHAIN_PRESETS, EFFECT_NAMES, EFFECT_PARAMS, EFFECT_PRESETS, type EffectType, type Song, suggestTunings } from '@gp-editor/core';
import { Inspector, type InspectorProps } from '../src/components/inspector/Inspector';
import { OUTPUT_GAIN } from '../src/components/effects/MasterStripEditor';
import { SongWriterPanel } from '../src/components/song-writer/SongWriterPanel';
import { INITIAL_DRAFT, stepLabel, writtenSummary } from '../src/hooks/use-song-writer';
import { chainPresetName, effectName, effectParamLabel, effectPresetName, formatEffectValue, nameKey } from '../src/lib/effect-values';
import { isMessageKey, setLanguage } from '../src/lib/i18n/i18n';
import { lyricsFit } from '../src/lib/lyrics-draft';
import { sourceSummary } from '../src/lib/scale-sources';
import { readToolAnswer } from '../src/lib/tool-answer';
import { tunerStatusText, tunerStrings } from '../src/lib/tuner-display';
import { neckTitle, retuneNotice, tuningHint } from '../src/lib/tuning-hint';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note, onStrings } from '../test-support/songs';

const SONG: Song = makeSong([[beat(960, [note(1, 3)])], [beat(4800, [note(1, 5)])]]);

afterEach(() => setLanguage('en'));

function texts(renderer: ReactTestRenderer.ReactTestRenderer): readonly string[] {
  return renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
}

function renderInspector(): ReactTestRenderer.ReactTestRenderer {
  const props: InspectorProps = {
    palette: PALETTE,
    song: SONG,
    trackIndex: 0,
    mode: 'notationAndTab',
    soundBanks: { banks: [], selectedId: '' },
    onChangeMode: jest.fn(),
    onSetSongInfo: jest.fn(),
    onSetTrackName: jest.fn(),
    onSetTrackCapo: jest.fn(),
    onSetTrackTuning: jest.fn(),
    onDismissNotice: jest.fn(),
    onEditInstrument: jest.fn(),
    onSelectSoundBank: jest.fn(),
    onAddSoundBank: jest.fn(),
    onRemoveSoundBank: jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Inspector {...props} />);
  });
  return renderer;
}

describe('the tools in Korean', () => {
  it('names the inspector’s tabs and the TRACK tab’s sections in Korean, and switches back to English', () => {
    // Arrange
    setLanguage('ko');
    const renderer = renderInspector();

    // Act
    const korean = texts(renderer);
    ReactTestRenderer.act(() => setLanguage('en'));
    const english = texts(renderer);
    ReactTestRenderer.act(() => renderer.unmount());

    // Assert
    expect(korean).toEqual(expect.arrayContaining(['곡', '트랙', '음표', '정보', '기보', '사운드', '1개 중 1번째 · 6줄']));
    expect(english).toEqual(expect.arrayContaining(['SONG', 'TRACK', 'NOTE', 'INFORMATION', 'MUSICAL NOTATION', '1 of 1 · 6 strings']));
  });

  it('writes the song writer panel in Korean', () => {
    setLanguage('ko');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <SongWriterPanel
          palette={PALETTE}
          draft={INITIAL_DRAFT}
          onChangeDraft={jest.fn()}
          status={{ kind: 'idle' }}
          hasKey
          model="claude-opus-5-5"
          onSaveKey={jest.fn(() => Promise.resolve())}
          onChooseModel={jest.fn()}
          onWrite={jest.fn()}
          onCancel={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    const shown = texts(renderer);
    ReactTestRenderer.act(() => renderer.unmount());

    expect(shown).toEqual(expect.arrayContaining(['작곡 도우미', '장르', '길이', '참고', 'Claude가 곡을 구상한 다음 섹션별로 씁니다. 완성된 곡은 새 악보로 열립니다.']));
  });

  it('names the effects, their parameters, choices and presets in Korean', () => {
    setLanguage('ko');
    const reverbRoom = EFFECT_PARAMS.reverb.find((spec) => spec.id === 'room');

    expect([effectName('compressor'), effectParamLabel(EFFECT_PARAMS.eq[0]!), effectParamLabel(OUTPUT_GAIN)]).toEqual(['컴프레서', '로우 컷', '출력']);
    expect(reverbRoom === undefined ? '' : formatEffectValue(reverbRoom, 3)).toBe('중간 홀');
    expect([effectPresetName('Mid boost'), chainPresetName('Bass DI'), effectPresetName('Not a preset')]).toEqual(['중음 부스트', '베이스 DI', 'Not a preset']);
  });

  it('has a message for every effect, parameter, choice and preset gp-core names', () => {
    const types = Object.keys(EFFECT_NAMES) as EffectType[];
    const keys = [
      ...types.map((type) => `tools.effect.name.${type}`),
      ...types.flatMap((type) => EFFECT_PARAMS[type].map((spec) => `tools.effect.param.${nameKey(spec.label)}`)),
      ...types.flatMap((type) => EFFECT_PARAMS[type].flatMap((spec) => spec.choices ?? []).map((choice) => `tools.effect.choice.${nameKey(choice)}`)),
      ...types.flatMap((type) => EFFECT_PRESETS[type].map((preset) => `tools.effect.preset.${nameKey(preset.name)}`)),
      ...CHAIN_PRESETS.map((preset) => `tools.effect.chain.${nameKey(preset.name)}`),
    ];

    expect(keys.filter((key) => !isMessageKey(key))).toEqual([]);
  });

  it('says what the tuner and the song writer are doing in Korean', () => {
    setLanguage('ko');

    expect(tunerStatusText({ kind: 'listening' }, false)).toBe('한 번에 한 줄씩 치세요.');
    expect(tunerStrings(undefined).caption).toBe('기타 표준 튜닝');
    expect(stepLabel({ kind: 'writing', written: 3, total: 8, writing: ['Chorus'] })).toBe('Chorus 쓰는 중… (섹션 8개 중 3개 완료)');
    expect(writtenSummary({ ...SONG, info: { ...SONG.info, title: '' } }, [])).toBe('작곡 도우미: “새 곡” — 2마디, 트랙 1개.');
  });

  it('explains tunings, lyrics and the scale finder in Korean', () => {
    setLanguage('ko');
    const song = onStrings(makeSong([[beat(960, [note(6, 0)])]]), [64, 59, 55, 50, 45, 38]);
    const advice = suggestTunings(song, 0);
    const track = song.tracks[0];

    expect(advice === undefined || track === undefined ? '' : neckTitle(advice, track)).toBe('기타 · 6줄 · Drop D (D A D G B E)');
    expect(retuneNotice({ octaveShifted: 2, removed: 0 })).toBe('튜닝을 바꿨습니다: 음표 2개를 새 튜닝에 맞게 한 옥타브 옮김. ⌘Z로 이전 튜닝을 되돌립니다.');
    expect(lyricsFit(SONG, { trackIndex: 0, from: 1, text: 'one two three' })).toBe('마디 1부터 음표 2개에 음절 3개: 마지막 1개는 붙을 음표가 없습니다');
    expect(sourceSummary({ label: '마디 2', pitches: [] })).toBe('마디 2에 음표가 없습니다');
    expect(advice === undefined || track === undefined ? undefined : tuningHint(advice, track)).toBeUndefined();
  });

  it('reads a refused key in Korean', () => {
    setLanguage('ko');

    const answer = readToolAnswer({ status: 401, body: '{"error":{"message":"invalid x-api-key"}}' }, 'plan_song', { tooLong: '', what: '' });

    expect(answer).toEqual({ isOk: false, isRetryable: false, isFatal: true, message: 'Anthropic API 키가 거부되었습니다 (invalid x-api-key)' });
  });
});
