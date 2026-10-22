import ReactTestRenderer from 'react-test-renderer';
import { BarButton } from '../src/components/BarButton';
import { Toolbar } from '../src/components/Toolbar';
import { PALETTE } from '../test-support/score-helpers';

const EXPORT = 'Export…';

function render(hasDocument: boolean): { renderer: ReactTestRenderer.ReactTestRenderer; onCommand: jest.Mock } {
  const onCommand = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <Toolbar
        palette={PALETTE}
        hasDocument={hasDocument}
        canUndo={false}
        canRedo={false}
        isPlaying={false}
        isEdited={false}
        mode="notationAndTab"
        onCommand={onCommand}
      />,
    );
  });
  return { renderer, onCommand };
}

function exportButton(renderer: ReactTestRenderer.ReactTestRenderer): ReactTestRenderer.ReactTestInstance {
  const found = renderer.root.findAllByType(BarButton).find((button) => button.props.label === EXPORT);
  if (found === undefined) {
    throw new Error('no Export… button');
  }
  return found;
}

describe('Toolbar: Export…', () => {
  it('sits next to Save and is disabled until a document is open', () => {
    const { renderer } = render(false);
    const labels = renderer.root.findAllByType(BarButton).map((button) => button.props.label);
    expect(labels.slice(0, 5)).toEqual(['New', 'Open…', 'Import PDF…', 'Save', EXPORT]);
    expect(exportButton(renderer).props.isEnabled).toBe(false);
  });

  it('sends the export command when pressed with a document open', () => {
    // Arrange
    const { renderer, onCommand } = render(true);

    // Act
    ReactTestRenderer.act(() => exportButton(renderer).props.onPress());

    // Assert
    expect(exportButton(renderer).props.isEnabled).toBe(true);
    expect(onCommand).toHaveBeenCalledWith({ type: 'exportPdf' });
  });
});
