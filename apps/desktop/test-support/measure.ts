import type { ReactTestInstance } from 'react-test-renderer';

type MeasureCallback = (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => void;

interface MeasuredView {
  readonly measure: jest.Mock<void, [MeasureCallback]>;
}

function isMeasured(instance: unknown): instance is MeasuredView {
  const measure = (instance as { measure?: unknown } | null)?.measure;
  return jest.isMockFunction(measure) && measure.mock.calls.length > 0;
}

/**
 * Answers the last `measure` a control's view was asked for (react-native's jest views never call back): the view is
 * at (pageX, pageY) in the window's layout.
 */
export function answerMeasure(control: ReactTestInstance, pageX: number, pageY: number): void {
  const views = [control, ...control.findAll(() => true)].map((node) => node.instance as unknown).filter(isMeasured);
  const callback = views[0]?.measure.mock.calls.at(-1)?.[0];
  if (callback === undefined) {
    throw new Error('the control measured nothing');
  }
  callback(0, 0, 0, 0, pageX, pageY);
}
