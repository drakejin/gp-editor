import { useCallback, useRef } from 'react';

/**
 * A function that keeps its identity from render to render and calls the `callback` of the latest render: a handler
 * handed to a memoised component (or a native event subscription) that does not change with every state it reads, so
 * the component is not re-rendered (nor the listener re-added) when only that state changed.
 */
export function useStableCallback<Args extends readonly unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const latest = useRef(callback);
  latest.current = callback;
  return useCallback((...args: Args) => latest.current(...args), []);
}
