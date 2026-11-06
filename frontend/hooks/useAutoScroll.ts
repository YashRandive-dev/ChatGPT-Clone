import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a scroll container pinned to the bottom while content streams in, unless the user
 * has scrolled up to read earlier messages.
 */
export function useAutoScroll<T extends HTMLElement>(deps: unknown[], enabled = true) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinned.current = distance < 80;
    setAtBottom(distance < 80);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    pinned.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (enabled && pinned.current) ref.current?.scrollTo({ top: ref.current.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, onScroll, atBottom, scrollToBottom };
}
