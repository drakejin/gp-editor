import { type ComponentType, createElement } from 'react';
import type { TextProps } from 'react-native';

/** What `keepHangulWordsTogether` replaces: react-native's exports, whose `Text` is a getter. */
export interface TextExports {
  readonly Text: ComponentType<TextProps>;
}

/**
 * Korean wraps between words, as Korean is written, not inside one ("다음" never split over two lines): every `Text`
 * of the app gets `lineBreakStrategyIOS: 'hangul-word'` (NSLineBreakStrategyHangulWordPriority, which macOS applies on
 * its own only when the process runs in Korean) unless it sets one. Replaces the `Text` getter of react-native's exports
 * once, before the app's components render (index.js), so no component has to remember it; other text is unaffected.
 */
export function keepHangulWordsTogether(exports: TextExports): void {
  const original = exports.Text;
  if ((original as { readonly keepsHangulWords?: boolean }).keepsHangulWords === true) {
    return;
  }
  const HangulWordText = (props: TextProps) => createElement(original, { lineBreakStrategyIOS: 'hangul-word', ...props });
  HangulWordText.displayName = 'Text'; // i18n-exempt: a component's name
  HangulWordText.keepsHangulWords = true;
  // i18n-exempt: the export's name
  Object.defineProperty(exports, 'Text', { configurable: true, enumerable: true, get: () => HangulWordText });
}
