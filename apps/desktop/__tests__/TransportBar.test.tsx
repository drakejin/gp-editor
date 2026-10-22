import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { BarButton } from '../src/components/BarButton';
import { TransportBar, type TransportBarProps } from '../src/components/TransportBar';
import { INITIAL_PRACTICE, type PracticeAction } from '../src/state/practice';
import { PALETTE } from '../test-support/score-helpers';
import { beat, header, makeSong, note } from '../test-support/songs';

const song = makeSong(
  [1, 2, 3, 4].map((number) => [beat(header(number).start, [note(1, 0)])]),
  [1, 2, 3, 4].map((number) => header(number, { tempo: number === 3 ? 80 : 120 })),
);

function render(overrides: Partial<TransportBarProps> = {}): {
  readonly texts: () => string[];
  readonly press: (label: string, index?: number) => void;
  readonly isEnabled: (label: string, index?: number) => boolean;
  readonly actions: PracticeAction[];
} {
  const actions: PracticeAction[] = [];
  const props: TransportBarProps = {
    palette: PALETTE,
    song,
    cursorMeasureIndex: 1,
    practice: INITIAL_PRACTICE,
    onChangePractice: (action) => actions.push(action),
    soundBanks: { banks: [], selectedId: '' },
    onSelectSoundBank: () => undefined,
    onAddSoundBank: () => undefined,
    onRemoveSoundBank: () => undefined,
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<TransportBar {...props} />);
  });
  const buttons = (label: string) =>
    renderer.root.findAllByType(BarButton).filter((button) => button.props.label === label);
  return {
    texts: () => renderer.root.findAllByType(Text).map((text) => String([text.props.children].flat().join(''))),
    press: (label, index = 0) => ReactTestRenderer.act(() => buttons(label)[index]?.props.onPress()),
    isEnabled: (label, index = 0) => buttons(label)[index]?.props.isEnabled !== false,
    actions,
  };
}

describe('TransportBar playback tempo', () => {
  it('shows the playback tempo of the cursor bar and its percentage', () => {
    // Act
    const bar = render({ practice: { ...INITIAL_PRACTICE, tempoScale: 0.75 } });

    // Assert
    expect(bar.texts()).toContain('♩ 90 · 75%');
  });

  it('steps the tempo by 5 BPM of the shown bar and resets it to 100%', () => {
    // Arrange
    const bar = render({ cursorMeasureIndex: 2, practice: { ...INITIAL_PRACTICE, tempoScale: 0.5 } });

    // Act
    bar.press('+');
    bar.press('−');
    bar.press('100%');

    // Assert
    expect(bar.actions).toEqual([
      { type: 'shiftTempo', delta: 5, writtenTempo: 80 },
      { type: 'shiftTempo', delta: -5, writtenTempo: 80 },
      { type: 'resetTempo' },
    ]);
  });

  it('shows the tempo of the loop start while looping', () => {
    // Act
    const bar = render({
      practice: { ...INITIAL_PRACTICE, isLooping: true, loop: { fromMeasureIndex: 2, toMeasureIndex: 3 } },
    });

    // Assert
    expect(bar.texts()).toContain('♩ 80 · 100%');
  });
});

describe('TransportBar loop', () => {
  const looping = { ...INITIAL_PRACTICE, isLooping: true, loop: { fromMeasureIndex: 1, toMeasureIndex: 2 } };

  it('shows the loop bars 1-based and toggles the loop at the cursor bar', () => {
    // Arrange
    const bar = render({ practice: looping });

    // Act
    bar.press('Loop');

    // Assert
    expect(bar.texts()).toEqual(expect.arrayContaining(['From 2', 'To 3']));
    expect(bar.actions).toEqual([{ type: 'toggleLoop', measureCount: 4, cursorMeasureIndex: 1 }]);
  });

  it('sets the ends from the cursor and steps them by one bar', () => {
    // Arrange
    const bar = render({ practice: looping, cursorMeasureIndex: 3 });

    // Act: the tempo stepper is the first −/+ pair, then From, then To.
    bar.press('From cursor');
    bar.press('To cursor');
    bar.press('+', 1);
    bar.press('−', 2);

    // Assert
    expect(bar.actions).toEqual([
      { type: 'setLoopFrom', measureIndex: 3, measureCount: 4, cursorMeasureIndex: 3 },
      { type: 'setLoopTo', measureIndex: 3, measureCount: 4, cursorMeasureIndex: 3 },
      { type: 'setLoopFrom', measureIndex: 2, measureCount: 4, cursorMeasureIndex: 3 },
      { type: 'setLoopTo', measureIndex: 1, measureCount: 4, cursorMeasureIndex: 3 },
    ]);
  });

  it('disables the cursor buttons without a cursor', () => {
    // Act
    const bar = render({ practice: looping, cursorMeasureIndex: undefined });

    // Assert
    expect(bar.isEnabled('From cursor')).toBe(false);
    expect(bar.isEnabled('To cursor')).toBe(false);
  });
});

describe('TransportBar speed trainer', () => {
  it('is off and disabled until the loop is on', () => {
    // Act
    const bar = render();

    // Assert
    expect(bar.texts()).toContain('Off');
    expect(bar.isEnabled('+', 3)).toBe(false);
  });

  it('steps the BPM per pass and the top tempo from the loop start', () => {
    // Arrange
    const practice = {
      ...INITIAL_PRACTICE,
      isLooping: true,
      loop: { fromMeasureIndex: 2, toMeasureIndex: 3 },
      trainerStep: 5,
    };
    const bar = render({ practice });

    // Act
    bar.press('+', 3);
    bar.press('+', 4);

    // Assert: written 80 at the loop start → default top max(80, 80 + 20) = 100.
    expect(bar.texts()).toEqual(expect.arrayContaining(['+5 BPM / pass', 'up to ♩ 100']));
    expect(bar.actions).toEqual([
      { type: 'shiftTrainerStep', delta: 1 },
      { type: 'shiftTrainerMaxTempo', delta: 5, writtenTempo: 80 },
    ]);
  });

  it('shows the pass being played and its tempo', () => {
    // Act
    const bar = render({ practice: { ...INITIAL_PRACTICE, isLooping: true }, loopPass: { passIndex: 2, tempo: 110 } });

    // Assert
    expect(bar.texts()).toContain('Pass 3 · ♩ 110');
  });
});
