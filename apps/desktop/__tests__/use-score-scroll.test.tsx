import type { RefObject } from 'react';
import type { FlatList } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type { StringAddress } from '@gp-editor/core';
import { type ScoreLine, lineAt, lineOf, linePlace, useScoreScroll } from '../src/hooks/use-score-scroll';
import type { ScoreLayout, ScoreStaff, ScoreSystem } from '../src/score/score-layout';

const staff = (trackIndex: number, top: number, height: number) => ({ trackIndex, top, height }) as ScoreStaff;
const system = (firstBar: number, top: number, staves: ScoreStaff[]): ScoreSystem => ({
  rows: staves.map(() => ({ measures: [{ measureIndex: firstBar, width: 100, beats: [], showTimeSignature: false, showTempo: false, showTripletFeel: false }] })),
  namesWidth: 0, headerWidth: 40, staves, top, height: staves.reduce((sum, each) => sum + each.height, 0),
});

describe('the page lines of systems of different heights', () => {
  // Arrange: two tracks; the first system 300 points tall, the second 180
  const layout: ScoreLayout = {
    staves: [staff(0, 0, 200), staff(2, 200, 160)],
    systems: [system(0, 0, [staff(0, 0, 180), staff(2, 180, 120)]), system(4, 300, [staff(0, 0, 100), staff(2, 100, 80)])],
    clefWidth: 40,
  };

  it('places each line at its system’s top plus its staff’s top in that system, as tall as that staff', () => {
    expect(linePlace(layout, lineAt(layout, 0))).toEqual({ top: 0, height: 180 });
    expect(linePlace(layout, lineAt(layout, 1))).toEqual({ top: 180, height: 120 });
    expect(linePlace(layout, lineAt(layout, 2))).toEqual({ top: 300, height: 100 });
    expect(linePlace(layout, lineAt(layout, 3))).toEqual({ top: 400, height: 80 });
  });

  it('finds the line of a bar on a track’s staves', () => {
    expect(lineOf(layout, 4, 2)).toBe(3);
    expect(lineOf(layout, 0)).toBe(0);
    expect(lineOf(layout, 9)).toBe(-1);
  });
});

describe('useScoreScroll', () => {
  // Arrange: one track, four systems 250 points tall, a 120-point title block and 22 points of desk in a 400-point view
  const layout: ScoreLayout = {
    staves: [staff(0, 0, 250)],
    systems: [0, 1, 2, 3].map((bar) => system(bar, bar * 250, [staff(0, 0, 250)])),
    clefWidth: 40,
  };
  const at = (measureIndex: number): StringAddress => ({ trackIndex: 0, measureIndex, beatIndex: 0, voiceIndex: 0, string: 1 });

  function renderScroll(cursor: StringAddress) {
    const scrollToIndex = jest.fn();
    const listRef = { current: { scrollToIndex } } as unknown as RefObject<FlatList<ScoreLine> | null>;
    let onScroll!: ReturnType<typeof useScoreScroll>['onScroll'];
    function Probe({ address }: { readonly address: StringAddress }) {
      onScroll = useScoreScroll(listRef, { layout, zoom: 1, headerHeight: 120, viewportHeight: 400, topMargin: 22, cursor: address }).onScroll;
      return null;
    }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<Probe address={cursor} />);
    });
    return {
      scrollToIndex,
      scrollTo: (y: number) => onScroll({ nativeEvent: { contentOffset: { y } } }),
      moveTo: (address: StringAddress) => ReactTestRenderer.act(() => renderer.update(<Probe address={address} />)),
    };
  }

  it('scrolls back to the cursor’s system when only its lower part shows', () => {
    // Arrange: scrolled so the second system (392–642 down the content) shows whole and the first only below 250
    const view = renderScroll(at(0));
    view.moveTo(at(1));
    view.scrollTo(250);
    view.scrollToIndex.mockClear();

    // Act
    view.moveTo(at(0));

    // Assert
    expect(view.scrollToIndex).toHaveBeenCalledWith({ index: 0, viewPosition: 0.25, animated: false });
  });

  it('leaves the view where it is while the cursor’s system shows whole', () => {
    // Arrange
    const view = renderScroll(at(0));
    view.scrollTo(250);
    view.scrollToIndex.mockClear();

    // Act
    view.moveTo(at(1));

    // Assert
    expect(view.scrollToIndex).not.toHaveBeenCalled();
  });

  it('keeps a page just shown at its top while the cursor’s system starts on the first screen', () => {
    const view = renderScroll(at(0));
    expect(view.scrollToIndex).not.toHaveBeenCalled();
  });
});
