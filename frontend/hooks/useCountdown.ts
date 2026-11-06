import { useCallback, useEffect, useState } from 'react';

/** Seconds-remaining countdown, used for "Resend code in 42s". */
export function useCountdown(initial = 0) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const start = useCallback((seconds: number) => setLeft(Math.max(0, Math.ceil(seconds))), []);
  return { left, start, running: left > 0 };
}
