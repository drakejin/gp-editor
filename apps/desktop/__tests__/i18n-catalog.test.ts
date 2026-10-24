import { EN, EN_FILES } from '../src/lib/i18n/en';
import { KO } from '../src/lib/i18n/ko';
import { type Message, placeholdersOf } from '../src/lib/i18n/messages';

const enKeys = Object.keys(EN).sort();

function isPlural(message: Message): boolean {
  return typeof message !== 'string';
}

describe('message catalogues', () => {
  it('have the same keys in English and Korean', () => {
    expect(Object.keys(KO).sort()).toEqual(enKeys);
  });

  it('use the same placeholders in both languages', () => {
    const different = enKeys.filter((key) => {
      const en = EN[key as keyof typeof EN] as Message;
      const ko = KO[key as keyof typeof KO];
      return placeholdersOf(en).join(',') !== placeholdersOf(ko).join(',');
    });

    expect(different).toEqual([]);
  });

  it('give every English plural a count to choose its form by', () => {
    const withoutCount = enKeys.filter((key) => {
      const en = EN[key as keyof typeof EN] as Message;
      return isPlural(en) && !placeholdersOf(en).includes('count');
    });

    expect(withoutCount).toEqual([]);
  });

  it('keep each key in the file named by its first part', () => {
    const misplaced = Object.entries(EN_FILES).flatMap(([file, messages]) => Object.keys(messages).filter((key) => !key.startsWith(`${file}.`)));

    expect(misplaced).toEqual([]);
  });

  it('have no empty message', () => {
    const forms = (message: Message) => (typeof message === 'string' ? [message] : [message.one, message.other]);
    const empty = [...Object.entries(EN), ...Object.entries(KO)].filter(([, message]) => forms(message as Message).some((form) => form.trim() === ''));

    expect(empty.map(([key]) => key)).toEqual([]);
  });

  it('write every Korean message with Korean words, unless it only holds names, symbols or placeholders', () => {
    const latinOnly = enKeys.filter((key) => {
      const ko = KO[key as keyof typeof KO];
      const text = (typeof ko === 'string' ? ko : ko.other).replace(/\{\w+\}/g, '');
      return !/[가-힣]/.test(text) && /[a-z]{3,}/.test(text) && text !== (EN[key as keyof typeof EN] as Message);
    });

    expect(latinOnly).toEqual([]);
  });
});
