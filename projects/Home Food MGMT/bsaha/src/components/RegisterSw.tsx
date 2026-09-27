"use client";

import { useEffect } from "react";

/** Registers the service worker (public/sw.js) once the page is up. Production only: in dev it would cache stale builds. */
export function RegisterSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
