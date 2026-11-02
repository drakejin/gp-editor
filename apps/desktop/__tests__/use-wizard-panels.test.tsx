import ReactTestRenderer from 'react-test-renderer';
import { type AiEdit, INITIAL_AI_EDIT_DRAFT } from '../src/hooks/use-ai-edit';
import { type Compose, INITIAL_COMPOSE_DRAFT } from '../src/hooks/use-compose';
import { INITIAL_DRAFT, type SongWriter } from '../src/hooks/use-song-writer';
import {
  type WizardPanels,
  useWizardPanels,
} from '../src/hooks/use-wizard-panels';

/** What the fakes were asked to do, in order ("compose.hide", "focusScore", "aiEdit.run claude-opus-5-5" …). */
type CallLog = string[];

function fakeSongWriter(log: CallLog): SongWriter {
  const record = (name: string) => () => {
    log.push(`songWriter.${name}`);
  };
  return {
    isOpen: true,
    open: record('open'),
    close: record('close'),
    draft: INITIAL_DRAFT,
    changeDraft: record('changeDraft'),
    status: { kind: 'idle' },
    write: record('write'),
    cancel: record('cancel'),
  };
}

function fakeCompose(log: CallLog): Compose {
  const record = (name: string) => () => {
    log.push(`compose.${name}`);
  };
  return {
    isOpen: true,
    open: record('open'),
    close: record('close'),
    hide: record('hide'),
    draft: INITIAL_COMPOSE_DRAFT,
    changeDraft: record('changeDraft'),
    status: { kind: 'idle' },
    compose: model => log.push(`compose.compose ${model}`),
    cancel: record('cancel'),
  };
}

function fakeAiEdit(log: CallLog): AiEdit {
  const record = (name: string) => () => {
    log.push(`aiEdit.${name}`);
  };
  return {
    isOpen: true,
    open: record('open'),
    close: record('close'),
    hide: record('hide'),
    draft: INITIAL_AI_EDIT_DRAFT,
    changeDraft: record('changeDraft'),
    status: { kind: 'idle' },
    run: model => log.push(`aiEdit.run ${model}`),
    cancel: record('cancel'),
  };
}

/** The hook over fakes; `panels()` = what it returned at its latest render, `rerender()` renders it again. */
function render() {
  const log: CallLog = [];
  let panels: WizardPanels | undefined;
  const focusScore = () => log.push('focusScore');
  function Host() {
    panels = useWizardPanels(
      {
        songWriter: fakeSongWriter(log),
        compose: fakeCompose(log),
        aiEdit: fakeAiEdit(log),
      },
      focusScore,
    );
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<Host />);
  });
  const shown = (): WizardPanels => {
    if (panels === undefined) {
      throw new Error('the hook did not run');
    }
    return panels;
  };
  return {
    log,
    panels: shown,
    rerender: () => ReactTestRenderer.act(() => renderer.update(<Host />)),
  };
}

describe('useWizardPanels: one AI Wizard panel at a time', () => {
  it('opening AI Edit puts Compose from Here and the Song Writer away first, without stopping their runs', () => {
    // Arrange
    const probe = render();

    // Act
    ReactTestRenderer.act(() => probe.panels().aiEdit.open());

    // Assert: hide and the Song Writer's close leave a run going; close would stop Compose's
    expect(probe.log).toEqual([
      'songWriter.close',
      'compose.hide',
      'aiEdit.open',
    ]);
  });

  it('opening Compose from Here puts AI Edit and the Song Writer away first', () => {
    const probe = render();
    ReactTestRenderer.act(() => probe.panels().compose.open());
    expect(probe.log).toEqual([
      'songWriter.close',
      'aiEdit.hide',
      'compose.open',
    ]);
  });

  it('opening the Song Writer puts Compose from Here and AI Edit away first', () => {
    const probe = render();
    ReactTestRenderer.act(() => probe.panels().songWriter.open());
    expect(probe.log).toEqual([
      'compose.hide',
      'aiEdit.hide',
      'songWriter.open',
    ]);
  });

  it('keeps each opener the same function from render to render (the menus’ listeners hold them)', () => {
    // Arrange
    const probe = render();
    const before = probe.panels();

    // Act
    probe.rerender();

    // Assert
    expect(probe.panels().compose.open).toBe(before.compose.open);
    expect(probe.panels().aiEdit.open).toBe(before.aiEdit.open);
    expect(probe.panels().songWriter.open).toBe(before.songWriter.open);
  });
});

describe('useWizardPanels: a request sent', () => {
  it('gives the keyboard back to the score before Compose from Here asks Claude, so Edit ▸ Undo takes back what it writes', () => {
    // Arrange
    const probe = render();

    // Act
    ReactTestRenderer.act(() =>
      probe.panels().compose.compose('claude-opus-5-5'),
    );

    // Assert
    expect(probe.log).toEqual([
      'focusScore',
      'compose.compose claude-opus-5-5',
    ]);
  });

  it('gives the keyboard back to the score before AI Edit runs', () => {
    const probe = render();
    ReactTestRenderer.act(() => probe.panels().aiEdit.run('claude-sonnet-5'));
    expect(probe.log).toEqual(['focusScore', 'aiEdit.run claude-sonnet-5']);
  });

  it('leaves the panels’ other parts as they are', () => {
    const probe = render();
    ReactTestRenderer.act(() => probe.panels().compose.close());
    expect(probe.log).toEqual(['compose.close']);
    expect(probe.panels().aiEdit.draft).toBe(INITIAL_AI_EDIT_DRAFT);
  });
});
