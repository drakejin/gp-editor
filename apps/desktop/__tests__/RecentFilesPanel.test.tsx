import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { BarButton } from '../src/components/BarButton';
import { RecentFileList } from '../src/components/RecentFileList';
import { RecentFilesPanel } from '../src/components/RecentFilesPanel';
import type { RecentFile } from '../src/lib/recent-files';
import { PALETTE } from '../test-support/score-helpers';

const PINNED: RecentFile = { path: '/Users/me/Tabs/Pinned.gp5', name: 'Pinned.gp5', isPinned: true, openedAt: 1, isMissing: false };
const RECENT: RecentFile = { path: '/Users/me/Tabs/Recent.gpx', name: 'Recent.gpx', isPinned: false, openedAt: 3, isMissing: false };
const GONE: RecentFile = { path: '/Volumes/USB/Gone.gp5', name: 'Gone.gp5', isPinned: false, openedAt: 2, isMissing: true };
const FILES = [PINNED, RECENT, GONE];

interface Handlers {
  readonly onOpen: jest.Mock;
  readonly onTogglePin: jest.Mock;
  readonly onRemove: jest.Mock;
  readonly onClear: jest.Mock;
  readonly onClose: jest.Mock;
  readonly onShowAll: jest.Mock;
}

function handlers(): Handlers {
  return { onOpen: jest.fn(), onTogglePin: jest.fn(), onRemove: jest.fn(), onClear: jest.fn(), onClose: jest.fn(), onShowAll: jest.fn() };
}

function create(element: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

function buttons(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance[] {
  return renderer.root.findAllByType(BarButton);
}

function labels(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return buttons(renderer).map((button) => button.props.label as string);
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .map((text) => [text.props.children].flat().join(''))
    .join(' | ');
}

function press(renderer: ReactTestRenderer.ReactTestRenderer, index: number): void {
  ReactTestRenderer.act(() => buttons(renderer)[index]?.props.onPress());
}

describe('RecentFileList', () => {
  it('lists each file with its folder, Open, Pin or Unpin and Remove', () => {
    // Arrange
    const renderer = create(<RecentFileList files={FILES} palette={PALETTE} {...handlers()} />);

    // Act
    const shown = texts(renderer);

    // Assert
    expect(labels(renderer)).toEqual(['Open', 'Unpin', 'Remove', 'Open', 'Pin', 'Remove', 'Open', 'Pin', 'Remove']);
    expect(shown).toContain('Pinned.gp5');
    expect(shown).toContain('~/Tabs');
    expect(shown).toContain('/Volumes/USB');
    expect(shown).toContain('pinned');
    expect(shown).toContain('missing');
  });

  it('cannot open a missing file, but can remove it', () => {
    const renderer = create(<RecentFileList files={[GONE]} palette={PALETTE} {...handlers()} />);
    const [open, , remove] = buttons(renderer);
    expect(open?.props.isEnabled).toBe(false);
    expect(remove?.props.isEnabled).not.toBe(false);
  });

  it('opens, pins, unpins and removes the file of its row', () => {
    // Arrange
    const calls = handlers();
    const renderer = create(<RecentFileList files={FILES} palette={PALETTE} {...calls} />);

    // Act
    press(renderer, 0);
    press(renderer, 1);
    press(renderer, 4);
    press(renderer, 5);

    // Assert
    expect(calls.onOpen).toHaveBeenCalledWith(PINNED.path);
    expect(calls.onTogglePin.mock.calls).toEqual([[PINNED.path], [RECENT.path]]);
    expect(calls.onRemove).toHaveBeenCalledWith(RECENT.path);
  });

  it('shows at most `limit` files under a heading, with a button for the rest', () => {
    // Arrange
    const calls = handlers();
    const renderer = create(<RecentFileList files={FILES} palette={PALETTE} heading="RECENT FILES" limit={2} {...calls} />);

    // Act
    press(renderer, labels(renderer).indexOf('All 3 Recent Files…'));

    // Assert
    expect(texts(renderer)).toContain('RECENT FILES');
    expect(texts(renderer)).not.toContain('Gone.gp5');
    expect(calls.onShowAll).toHaveBeenCalled();
  });

  it('shows nothing without files', () => {
    const renderer = create(<RecentFileList files={[]} palette={PALETTE} heading="RECENT FILES" {...handlers()} />);
    expect(renderer.toJSON()).toBeNull();
  });
});

describe('RecentFilesPanel', () => {
  it('lists every file and clears the unpinned ones', () => {
    // Arrange
    const calls = handlers();
    const renderer = create(<RecentFilesPanel files={FILES} palette={PALETTE} {...calls} />);

    // Act
    press(renderer, labels(renderer).indexOf('Clear Unpinned'));
    press(renderer, labels(renderer).indexOf('Close'));

    // Assert
    expect(texts(renderer)).toContain('Recent Files');
    expect(texts(renderer)).toContain('Gone.gp5');
    expect(calls.onClear).toHaveBeenCalled();
    expect(calls.onClose).toHaveBeenCalled();
  });

  it('says how the list fills when it is empty, and has nothing to clear', () => {
    const renderer = create(<RecentFilesPanel files={[]} palette={PALETTE} {...handlers()} />);
    expect(texts(renderer)).toContain('Files you open or save are listed here');
    expect(buttons(renderer).find((button) => button.props.label === 'Clear Unpinned')?.props.isEnabled).toBe(false);
  });
});
