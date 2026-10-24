import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { SaveChangesPanel } from '../src/components/SaveChangesPanel';
import { TopBar, type TopBarProps } from '../src/components/TopBar';
import { ErrorBanner } from '../src/components/WindowOverlays';
import { audioExportSummary, audioSavedHint } from '../src/export/audio-export-plan';
import { DEFAULT_AUDIO_EXPORT } from '../src/export/audio-formats';
import { pngSavedHint } from '../src/export/png-export';
import { ASCII_TAB_FILE, SAVE_FORMATS, saveHint } from '../src/lib/file-formats';
import { setLanguage } from '../src/lib/i18n/i18n';
import { lcdInfo } from '../src/lib/lcd';
import { authorshipCredits } from '../src/lib/song-credits';
import { projectStatusText } from '../src/pdf-import/status';
import { INITIAL_PANELS } from '../src/state/panels';
import { INITIAL_PRACTICE } from '../src/state/practice';
import { PALETTE } from '../test-support/score-helpers';
import { beat, makeSong, note } from '../test-support/songs';

const SONG = makeSong([[beat(960, [])], [beat(4800, [note(2, 5)])]]);

function korean(): void {
  ReactTestRenderer.act(() => setLanguage('ko'));
}

afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));

function renderTopBar(): ReactTestRenderer.ReactTestRenderer {
  const props: TopBarProps = {
    palette: PALETTE,
    hasDocument: true,
    canUndo: true,
    canRedo: false,
    isPlaying: false,
    isEdited: false,
    isLooping: false,
    zoom: 1,
    speedLabel: '100%',
    panels: INITIAL_PANELS,
    onTogglePanel: jest.fn(),
    onOpenMenu: jest.fn(),
    onToggleLoop: jest.fn(),
    isMetronomeOn: false,
    isCountInOn: false,
    onTogglePractice: jest.fn(),
    onShiftSpeed: jest.fn(),
    onShowShortcuts: jest.fn(),
    onCommand: jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TopBar {...props} />);
  });
  return renderer;
}

describe('the window in Korean', () => {
  it('switches the top bar’s labels and tooltips when the language changes, memoised as it is', () => {
    // Arrange
    const renderer = renderTopBar();
    const labels = () => renderer.root.findAllByType(ChromeButton).map((button) => [button.props.label, button.props.tooltip]);
    const english = labels();

    // Act
    korean();

    // Assert
    expect(english).toContainEqual(['⟲ Loop', 'Loop the selected bars, or the whole song with nothing selected']);
    expect(labels()).toContainEqual(['⟲ 반복', '선택한 마디를 구간 반복합니다. 선택이 없으면 곡 전체를 반복합니다']);
    expect(labels()).toContainEqual(['메트로놈', '메트로놈: 박마다 클릭 소리 (⌥M)']);
    expect(labels()).toContainEqual(['↶', '실행 취소 (⌘Z)']);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('asks whether to save a tab’s changes in Korean', () => {
    korean();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<SaveChangesPanel palette={PALETTE} name="Etude" onSave={jest.fn()} onDiscard={jest.fn()} onCancel={jest.fn()} />);
    });

    const texts = renderer.root.findAllByType(Text).map((text) => text.props.children);

    expect(texts).toContain('“Etude”의 변경 사항을 저장할까요?');
    expect(renderer.root.findAllByType(ChromeButton).map((button) => button.props.label)).toEqual(['저장 안 함', '취소', '저장']);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shows an error with a translated way to dismiss it, the detail as it came', () => {
    korean();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<ErrorBanner message="재생하지 못했습니다: disk full" onDismiss={jest.fn()} />);
    });

    expect(renderer.root.findByType(Text).props.children).toBe('재생하지 못했습니다: disk full (클릭해서 닫기)');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('writes the LCD’s position and track in Korean, as short as in English', () => {
    korean();

    const info = lcdInfo({ song: SONG, trackIndex: 0, cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 2 }, practice: INITIAL_PRACTICE });
    const empty = lcdInfo({ song: SONG, trackIndex: 0, cursor: { trackIndex: 0, measureIndex: 1, beatIndex: 0, voiceIndex: 0, string: 1 }, practice: INITIAL_PRACTICE });

    expect(info.position).toBe('성부 1 · 박 1 · 2번 줄 · 5프렛');
    expect(empty.position).toBe('성부 1 · 박 1 · 1번 줄 · 비어 있음');
    expect(info.track).toBe('1. Guitar');
  });

  it('reads a save format’s note in the language shown when it is read, for the save panel and the hint', () => {
    const gp4 = SAVE_FORMATS[2]!;
    const english = gp4.note;

    korean();

    expect(english).toMatch(/^Guitar Pro 4 keeps one voice per bar/);
    expect(gp4.note).toMatch(/^Guitar Pro 4 파일은 마디마다 성부 하나/);
    expect(ASCII_TAB_FILE.label).toBe('ASCII 타브 (.txt)');
    expect(saveHint(gp4, SONG)).toBe(gp4.note);
  });

  it('says what an export saved in Korean', () => {
    korean();

    expect(pngSavedHint(['Song.png'], 'Exports')).toBe('Song.png을(를) “Exports”에 저장했습니다.');
    expect(pngSavedHint(['Song-1.png', 'Song-2.png', 'Song-3.png'], 'Exports')).toBe('PNG 이미지 3개를 “Exports”에 저장했습니다: Song-1.png … Song-3.png.');
    expect(audioSavedHint([{ name: 'Song.wav', seconds: 6 }], 'Exports', DEFAULT_AUDIO_EXPORT)).toBe('Song.wav(00:06, WAV, 16비트, 44.1 kHz)을(를) “Exports”에 저장했습니다.');
  });

  it('names the exported audio files of a loop in Korean, and says when every track is muted', () => {
    korean();
    const loop = { fromMeasureIndex: 0, toMeasureIndex: 1 };
    const muted = { ...SONG, tracks: SONG.tracks.map((track) => ({ ...track, mute: true })) };

    expect(audioExportSummary(SONG, 'Song.gp5', { ...DEFAULT_AUDIO_EXPORT, range: 'loop' }, loop, 4)).toMatch(/→ Song \(마디 1–2\)\.wav$/);
    expect(audioExportSummary(muted, 'Song.gp5', DEFAULT_AUDIO_EXPORT, undefined, 4)).toBe('모든 트랙이 음소거되어 있어 내보낼 것이 없습니다.');
  });

  it('credits the song’s authors and a PDF import’s progress in Korean', () => {
    korean();
    const info = { ...SONG.info, words: 'Kim', music: 'Lee', transcriber: 'Park' };
    const project = { pagesDone: [1, 2], pageCount: 5, status: 'transcribing' } as unknown as Parameters<typeof projectStatusText>[0];

    expect(authorshipCredits(info)).toEqual(['작곡: Lee', '작사: Kim', '타브: Park']);
    expect(projectStatusText(project)).toBe('채보 중 · 5쪽 중 2쪽');
  });
});
