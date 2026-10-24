import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { SettingsPanel } from '../src/components/settings/SettingsPanel';
import { DEFAULT_SETTINGS } from '../src/lib/app-settings';
import { setLanguage } from '../src/lib/i18n/i18n';
import type { SettingsSnapshot } from '../src/state/settings-store';
import { PALETTE } from '../test-support/score-helpers';

afterEach(() => ReactTestRenderer.act(() => setLanguage('en')));

function render(snapshot: Partial<SettingsSnapshot> = {}) {
  const onChange = jest.fn();
  const onClose = jest.fn();
  const full: SettingsSnapshot = { settings: DEFAULT_SETTINGS, systemLanguage: 'ko', needsRestart: false, ...snapshot };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<SettingsPanel palette={PALETTE} snapshot={full} onChange={onChange} onClose={onClose} />);
  });
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const press = (label: string) => ReactTestRenderer.act(() => buttons().find((button) => button.props.label === label)?.props.onPress());
  const texts = () => renderer.root.findAllByType(Text).map((text) => [text.props.children].flat().join(''));
  return { renderer, onChange, onClose, buttons, press, texts };
}

describe('SettingsPanel', () => {
  it('lists the language, contrast and paper choices with the current ones lit', () => {
    const panel = render({ settings: { language: 'ko', contrast: 'high', paper: 'system' } });

    const lit = panel.buttons().filter((button) => button.props.isActive).map((button) => button.props.label);

    expect(panel.buttons().map((button) => button.props.label)).toEqual(['Close', 'System (한국어)', 'English', '한국어', 'Standard', 'High', 'Follow the system', 'Light', 'Dark']);
    expect(lit).toEqual(['한국어', 'High', 'Follow the system']);
  });

  it('changes a setting and closes', () => {
    const panel = render();

    panel.press('한국어');
    panel.press('High');
    panel.press('Dark');
    panel.press('Close');

    expect(panel.onChange.mock.calls).toEqual([[{ language: 'ko' }], [{ contrast: 'high' }], [{ paper: 'dark' }]]);
    expect(panel.onClose).toHaveBeenCalledTimes(1);
  });

  it('is written in Korean when the app is', () => {
    ReactTestRenderer.act(() => setLanguage('ko'));

    const panel = render({ needsRestart: true });

    expect(panel.texts()).toEqual(expect.arrayContaining(['설정', '언어', '인터페이스 대비', '악보 용지']));
    expect(panel.buttons().map((button) => button.props.label)).toEqual(['닫기', '시스템 설정 따름 (한국어)', 'English', '한국어', '표준', '높음', '시스템 설정 따름', '밝게', '어둡게']);
    expect(panel.texts().some((text) => text.includes('다시 시작하면'))).toBe(true);
  });

  it('shows why a change could not be kept', () => {
    const panel = render({ error: 'Could not keep the settings: Disk full' });

    expect(panel.texts()).toContain('Could not keep the settings: Disk full');
  });
});
