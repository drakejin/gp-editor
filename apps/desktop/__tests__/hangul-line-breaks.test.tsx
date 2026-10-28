import { Text, type TextProps } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { type TextExports, keepHangulWordsTogether } from '../src/lib/hangul-line-breaks';

/** react-native's exports as index.js sees them: `Text` behind a getter. */
function fakeExports(): TextExports {
  return Object.defineProperty({} as { Text: TextExports['Text'] }, 'Text', { configurable: true, enumerable: true, get: () => Text });
}

function rendered(exports: TextExports, props: TextProps): TextProps {
  const Shown = exports.Text;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Shown {...props} />);
  });
  return renderer.root.findByType(Text).props as TextProps;
}

describe('keepHangulWordsTogether', () => {
  it('gives every Text the Hangul word line breaks, keeping its own props', () => {
    const exports = fakeExports();

    keepHangulWordsTogether(exports);
    const props = rendered(exports, { numberOfLines: 2, children: '창과 메뉴는 바로 바뀝니다' });

    expect(props).toMatchObject({ lineBreakStrategyIOS: 'hangul-word', numberOfLines: 2, children: '창과 메뉴는 바로 바뀝니다' });
  });

  it('leaves a Text’s own line break strategy alone, and wraps only once', () => {
    const exports = fakeExports();

    keepHangulWordsTogether(exports);
    const wrapped = exports.Text;
    keepHangulWordsTogether(exports);
    const props = rendered(exports, { lineBreakStrategyIOS: 'standard', children: 'x' });

    expect(exports.Text).toBe(wrapped);
    expect(props.lineBreakStrategyIOS).toBe('standard');
  });
});
