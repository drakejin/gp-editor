import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { AutosaveManifest } from '../src/autosave/autosave-manifest';
import type { AutosavedWork } from '../src/autosave/autosave-recovery';
import { ChromeButton } from '../src/components/chrome/ChromeButton';
import { RecoverWorkPanel, type RecoverWorkPanelProps } from '../src/components/RecoverWorkPanel';
import { PALETTE } from '../test-support/score-helpers';

function work(documentId: string, title: string, fileName: string, savedAt: Date): AutosavedWork {
  const manifest: AutosaveManifest = {
    version: 1,
    documentId,
    title,
    fileName,
    path: fileName === 'Untitled' ? '' : `/scores/${fileName}`,
    format: '',
    savedAt: savedAt.toISOString(),
    session: { id: 's', pid: 1 },
    status: 'unsaved',
  };
  const entry = { folder: `2026-11-04/${documentId}`, manifest };
  return { documentId, newest: entry, entries: [entry] };
}

const WORKS = [work('a', 'Canon', 'Canon.gp5', new Date(2026, 10, 4, 14, 32)), work('b', 'Untitled', 'Untitled', new Date(2026, 10, 3, 9, 5))];

function render(props: Partial<RecoverWorkPanelProps> = {}) {
  const handlers = { onRestoreAll: jest.fn(), onRestore: jest.fn(), onDecline: jest.fn(), onClose: jest.fn(), onShowFolder: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<RecoverWorkPanel palette={PALETTE} mode="launch" works={WORKS} isAvailable {...handlers} {...props} />);
  });
  const texts = () => renderer.root.findAllByType(Text).map((text) => text.props.children as unknown);
  const buttons = () => renderer.root.findAllByType(ChromeButton);
  const press = (label: string, index = 0) => ReactTestRenderer.act(() => buttons().filter((button) => button.props.label === label)[index]?.props.onPress());
  return { renderer, handlers, texts, buttons, press };
}

describe('RecoverWorkPanel at launch', () => {
  it('asks whether to restore the unsaved work: each document, its file and when it was autosaved', () => {
    // Act
    const panel = render();

    // Assert
    expect(panel.texts()).toEqual(expect.arrayContaining(['Restore the work you did not save?', 'Canon', 'Canon.gp5 · autosaved 2026-11-04 14:32', 'Untitled · autosaved 2026-11-03 09:05']));
    expect(panel.buttons().map((button) => button.props.label)).toEqual(['Don’t Restore', 'Restore']);
    expect(panel.buttons().find((button) => button.props.label === 'Restore')?.props.isActive).toBe(true);
  });

  it('answers Restore and Don’t Restore; a click outside answers nothing', () => {
    // Arrange
    const panel = render();

    // Act
    panel.press('Restore');
    panel.press('Don’t Restore');
    ReactTestRenderer.act(() => panel.renderer.root.findByProps({ testID: 'recover-work-backdrop' }).props.onPress());

    // Assert
    expect(panel.handlers.onRestoreAll).toHaveBeenCalledTimes(1);
    expect(panel.handlers.onDecline).toHaveBeenCalledTimes(1);
    expect(panel.handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RecoverWorkPanel as File ▸ Recover Autosaved Work…', () => {
  it('lists the kept work with a Restore button each, Show in Finder and Close', () => {
    // Arrange
    const panel = render({ mode: 'list' });

    // Act
    panel.press('Restore', 1);
    panel.press('Show in Finder');
    panel.press('Close');

    // Assert
    expect(panel.texts()).toContain('Autosaved Work');
    expect(panel.buttons().map((button) => button.props.label)).toEqual(['Restore', 'Restore', 'Show in Finder', 'Close']);
    expect(panel.handlers.onRestore).toHaveBeenCalledWith('b');
    expect(panel.handlers.onShowFolder).toHaveBeenCalledTimes(1);
    expect(panel.handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('says when nothing is kept, and on Windows that autosave is the Mac app’s only', () => {
    expect(render({ mode: 'list', works: [] }).texts()).toContain('Nothing was autosaved in the last 7 days that is not saved.');
    expect(render({ mode: 'list', works: [], isAvailable: false }).texts()).toContain('Autosave works in the Mac app only, for now.');
  });
});
