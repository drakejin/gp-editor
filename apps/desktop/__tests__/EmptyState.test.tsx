import { ScrollView, StyleSheet, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { EmptyState } from '../src/components/EmptyState';
import { PALETTE } from '../test-support/score-helpers';

// The start screen at the default 1280 × 800 window held more than fits (the recent files and many PDF import
// projects): centred in its area without scrolling, it ran over the top bar and the banners above and the last projects
// fell off the window. Its content scrolls inside its own area, centred while it fits.

function render() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <EmptyState
        isLoading={false}
        palette={PALETTE}
        onCreate={() => undefined}
        onOpen={() => undefined}
        onImportPdf={() => undefined}
        recentFiles={<Text>recent files</Text>}
        projects={<Text>projects</Text>}
      />,
    );
  });
  return renderer;
}

describe('EmptyState', () => {
  it('scrolls its content within its own area, the title, the recent files and the projects inside', () => {
    // Act
    const scroll = render().root.findByType(ScrollView);

    // Assert
    const texts = scroll.findAllByType(Text).map((text) => text.props.children);
    expect(texts).toEqual(expect.arrayContaining(['GP Editor', 'recent files', 'projects']));
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ flexGrow: 1, justifyContent: 'center', alignItems: 'center' });
  });
});
