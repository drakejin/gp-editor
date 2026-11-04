/** Tasks run one after the other, each once the one before has settled (a failure does not stop the ones after). */
export interface SerialQueue {
  readonly run: <T>(task: () => Promise<T>) => Promise<T>;
}

export function createSerialQueue(): SerialQueue {
  let last: Promise<unknown> = Promise.resolve();
  return {
    run: <T>(task: () => Promise<T>): Promise<T> => {
      const next = last.then(task, task);
      last = next.catch(() => undefined);
      return next;
    },
  };
}
