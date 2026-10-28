import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { useT } from '../src/hooks/use-i18n';
import { currentLanguage, isMessageKey, memoByLanguage, setLanguage, subscribeLanguage, t, translate, withLanguage } from '../src/lib/i18n/i18n';
import { resolveLanguage } from '../src/lib/i18n/language-setting';
import { formatMessage, placeholdersOf } from '../src/lib/i18n/messages';

afterEach(() => setLanguage('en'));

describe('formatMessage', () => {
  it('fills placeholders and leaves unknown ones as written', () => {
    expect(formatMessage('Bar {number} of {total} {missing}', { number: 3, total: 12 })).toBe('Bar 3 of 12 {missing}');
  });

  it('picks the plural form by count', () => {
    const message = { one: '{count} bar', other: '{count} bars' };

    expect([0, 1, 2].map((count) => formatMessage(message, { count }))).toEqual(['0 bars', '1 bar', '2 bars']);
  });

  it('lists the placeholders of every form', () => {
    expect(placeholdersOf({ one: '{count} file in {folder}', other: '{count} files' })).toEqual(['count', 'folder']);
  });
});

describe('t and the current language', () => {
  it('translates into the current language and tells listeners of a change', () => {
    const heard: string[] = [];
    const unsubscribe = subscribeLanguage(() => heard.push(currentLanguage()));

    const english = t('common.close');
    setLanguage('ko');
    const korean = t('common.close');
    setLanguage('ko');
    unsubscribe();

    expect([english, korean, heard]).toEqual(['Close', '닫기', ['ko']]);
  });

  it('translates into a given language with params', () => {
    expect(translate('ko', 'common.bars', { count: 4 })).toBe('4마디');
    expect(translate('en', 'common.bars', { count: 1 })).toBe('1 bar');
  });

  it('knows which run-time keys exist', () => {
    expect([isMessageKey('common.close'), isMessageKey('common.nothing')]).toEqual([true, false]);
  });

  it('rebuilds a language table once per language', () => {
    let builds = 0;
    const table = memoByLanguage(() => {
      builds += 1;
      return [t('common.save')];
    });

    const first = table();
    const again = table();
    setLanguage('ko');
    const korean = table();

    expect([first, again === first, korean, builds]).toEqual([['Save'], true, ['저장'], 2]);
  });

  it('builds text in another language without changing the shown one or telling listeners', () => {
    // Arrange
    setLanguage('ko');
    const heard: string[] = [];
    const unsubscribe = subscribeLanguage(() => heard.push(currentLanguage()));

    // Act
    const english = withLanguage('en', () => t('common.close'));
    const shown = t('common.close');
    unsubscribe();

    // Assert
    expect([english, shown, currentLanguage(), heard]).toEqual(['Close', '닫기', 'ko', []]);
  });
});

describe('resolveLanguage', () => {
  it('takes the first system language the app has, else English', () => {
    expect(resolveLanguage('system', ['ko-KR', 'en-US'])).toBe('ko');
    expect(resolveLanguage('system', ['ja-JP', 'ko-KR'])).toBe('ko');
    expect(resolveLanguage('system', ['fr-FR'])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
  });

  it('keeps a chosen language whatever the system says', () => {
    expect(resolveLanguage('en', ['ko-KR'])).toBe('en');
    expect(resolveLanguage('ko', ['en-US'])).toBe('ko');
  });
});

describe('useT', () => {
  function Label() {
    const translateKey = useT();
    return <Text>{translateKey('common.cancel')}</Text>;
  }

  it('re-renders a component when the language changes', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Label />);
    });

    ReactTestRenderer.act(() => setLanguage('ko'));
    const shown = renderer.root.findByType(Text).props.children;
    ReactTestRenderer.act(() => renderer.unmount());

    expect(shown).toBe('취소');
  });
});
