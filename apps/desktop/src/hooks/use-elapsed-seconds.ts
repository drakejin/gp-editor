import { useEffect, useState } from 'react';

const SECOND_MS = 1000;

/** Seconds since `startedAt` while it is set, counted once a second (only the component calling it re-renders). */
export function useElapsedSeconds(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) {
      return undefined;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === undefined ? 0 : Math.max(0, Math.floor((now - startedAt) / SECOND_MS));
}
