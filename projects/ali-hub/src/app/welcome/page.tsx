import { Suspense } from "react";
import { Welcome } from "./Welcome";

/**
 * /welcome · the onboarding of a guest account (2026-10-09 · Ali's father first). Reached once, right
 * after the first Google sign-in (the callback sends a new account here) and from Settings → Welcome
 * tour. No tab bar, no sidebar: one column, one step at a time. Everything it saves goes through the
 * same endpoints the app uses every day.
 */
export const metadata = { title: "Welcome · A L I" };

export default function WelcomePage() {
  return <Suspense fallback={null}><Welcome /></Suspense>;
}
