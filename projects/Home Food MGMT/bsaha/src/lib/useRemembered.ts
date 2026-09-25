"use client";

import { useEffect, useState } from "react";

/**
 * `useState` that also keeps the value in this tab's sessionStorage, so a screen that was
 * left for a moment (to open a dish) comes back with the same filters. First render uses the
 * default so server and client agree; the stored value is applied right after mounting.
 */
export function useRemembered<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`bsaha:${key}`);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch { /* private mode or blocked storage: keep the default */ }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try { sessionStorage.setItem(`bsaha:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value, loaded]);
  return [value, setValue] as const;
}
