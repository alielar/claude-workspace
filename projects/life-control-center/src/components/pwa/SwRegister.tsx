"use client";

import { useEffect } from "react";

/**
 * Registers the service worker and keeps the installed app current:
 *  - checks for a new version every time the app is opened or comes to the foreground
 *  - when a new version takes over, reloads once so the screen you see is the new one
 *    (otherwise a fresh deploy would only show up on the *second* open)
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // Only auto-reload on updates, not on the very first install.
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        }
        const check = () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); };
        document.addEventListener("visibilitychange", check);
        window.addEventListener("focus", check);
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
