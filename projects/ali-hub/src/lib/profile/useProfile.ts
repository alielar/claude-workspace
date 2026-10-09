"use client";

/**
 * The signed-in person's profile on the client · cached like everything else (the saved copy paints
 * first). Until the first answer `me` is null and the app behaves as Ali's (every section shown), so
 * Ali never waits on it; a guest's hidden sections disappear the moment the profile lands, which is
 * before the first paint on every open after the first.
 *
 * Switching accounts on one device (Ali trying his father's sign-in on his own laptop): the e-mail of
 * the last profile is kept in `cc-user-email`; a different one wipes every `cc:v1:*` saved copy and
 * reloads, so one person's lists never show under another's name.
 */

import { useEffect } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import type { Me, Profile, Section } from "@/lib/profile/types";

export const ME_KEY = "me";
const EMAIL_KEY = "cc-user-email";

export function useProfile(): { me: Me | null; profile: Profile | null; primary: boolean; has: (s: Section) => boolean; setMe: (m: Me) => void } {
  const { data, setData } = useCached<Me>(ME_KEY, () => fetchJson<Me>("/api/profile"));
  useEffect(() => {
    if (!data?.email) return;
    try {
      const last = localStorage.getItem(EMAIL_KEY);
      if (last && last !== data.email) { wipeSavedCopies(); localStorage.setItem(EMAIL_KEY, data.email); location.reload(); return; }
      if (!last) localStorage.setItem(EMAIL_KEY, data.email);
    } catch { /* storage blocked · nothing to wipe */ }
  }, [data?.email]);
  const profile = data?.profile ?? null;
  return {
    me: data, profile,
    primary: data ? data.primary : true,
    has: (s) => (data ? data.profile.sections.includes(s) : true),
    setMe: setData,
  };
}

/** Every saved copy and per-device remembered state that belongs to a person, not to the device. */
export function wipeSavedCopies() {
  try {
    const gone: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.startsWith("cc:v1:") || k === "cc-alai-draft" || k === "cc-todo-area")) gone.push(k); }
    for (const k of gone) localStorage.removeItem(k);
  } catch { /* ignore */ }
}
