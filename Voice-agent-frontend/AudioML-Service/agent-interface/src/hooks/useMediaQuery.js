import { useCallback, useSyncExternalStore } from "react";

// True while `query` (a CSS media query) matches; re-renders on change.
// Tracked in JS rather than only via CSS hidden/md:block when a layout
// swap must not mount the same stateful/fetching child twice.
export function useMediaQuery(query, serverFallback = true) {
  const subscribe = useCallback((cb) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => serverFallback);
}
