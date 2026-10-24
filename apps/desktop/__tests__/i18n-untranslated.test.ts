import { findUntranslatedIn, findUntranslatedStrings, readsLikeText } from '../test-support/untranslated-strings';

describe('untranslated strings', () => {
  it('finds no text shown to the user outside the catalogues (src/lib/i18n)', () => {
    // Arrange: every source file under src/, except the catalogues and codegen specs.
    // Act
    const found = findUntranslatedStrings().map(({ file, line, text }) => `${file}:${line} ${JSON.stringify(text)}`);

    // Assert: move the text to the catalogues, or mark why it stays (`// i18n-exempt: notation`).
    expect(found).toEqual([]);
  });

  it('flags JSX text, text props and word-like literals', () => {
    const source = [
      "const label = 'Save changes';",
      'const view = <Text>Close</Text>;',
      "const button = <ChromeButton label=\"Apply\" testID='apply-button' />;",
      'const title = `Track ${n}`;',
    ].join('\n');

    const found = findUntranslatedIn('Sample.tsx', source).map(({ text }) => text);

    expect(found).toEqual(['Save changes', 'Close', 'Apply', 'Track ']);
  });

  it('leaves keys, comparisons, cases, types, exempt lines and code-like strings alone', () => {
    const source = [
      "import { t } from './lib/i18n/i18n';",
      "type Mode = 'Score Only';",
      "const text = t('window.save.title');",
      "if (mode === 'Score Only') {}",
      "switch (mode) { case 'Score Only': break; }",
      "const action = { type: 'newFile', mode: 'notationAndTab' };",
      "const map = { 'Score Only': 1 };",
      "const mark = 'P.M.'; // i18n-exempt: notation abbreviation",
      "const id = <View testID='Save button' />;",
      'const row = <View testID={`Command ${id}`} />;',
    ].join('\n');

    const found = findUntranslatedIn('Sample.tsx', source);

    expect(found).toEqual([]);
  });

  it('skips a file marked as holding no shown text', () => {
    const source = "// i18n-exempt-file: prompts sent to the model\nconst prompt = 'Transcribe this page of sheet music';";

    expect(findUntranslatedIn('request.ts', source)).toEqual([]);
  });

  it('reads two words, a capitalised word or an ellipsis as text, not identifiers or symbols', () => {
    expect(['Close', 'two words', 'Open…'].map(readsLikeText)).toEqual([true, true, true]);
    expect(['notationAndTab', 'fileUrl', '#2C2E33', '♩ 120', ''].map(readsLikeText)).toEqual([false, false, false, false, false]);
  });
});
