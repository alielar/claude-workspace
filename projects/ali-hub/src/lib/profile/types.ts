/**
 * The PROFILE (2026-10-09 · the hub opened to a second person): what one account is called, which
 * sections it has, and whether its onboarding is done. Client-safe, no database here.
 *
 * Ali (the primary user) has everything and never saw an onboarding · `PRIMARY_PROFILE`. A guest
 * (his father) starts from `GUEST_PROFILE`: Today, To-do, Knowledge (with the Vault and Birthdays),
 * News and Settings · Train, Health, Mind and R2-D2 are Ali's (his Speediance program, his Watch,
 * his voice recordings, the Mac that ships code changes to this very app).
 */

export type Section = "train" | "health" | "mind" | "r2d2";
export const SECTIONS: Section[] = ["train", "health", "mind", "r2d2"];

export type Profile = {
  /** The onboarding at /welcome was finished (or never needed). */
  onboarded: boolean;
  /** First name · the greeting, the weekly brief's reader. */
  name: string;
  /** A few words about the person, written by them · fed to the weekly brief's writer so "why it matters" speaks to them. */
  about: string;
  /** The sections this account has beyond the common ones. */
  sections: Section[];
  /** Football on News and the one highlight on Today. */
  football: boolean;
  /** Ali's rule: Sunday has no clock. A guest's Sunday is a plain day. */
  sundayFree: boolean;
};

export const PRIMARY_PROFILE: Profile = {
  onboarded: true, name: "Ali",
  about: "builds with AI, runs a small online company, follows business and geopolitics, is Moroccan and lives in Spain",
  sections: ["train", "health", "mind", "r2d2"], football: true, sundayFree: true,
};
export const GUEST_PROFILE: Profile = { onboarded: false, name: "", about: "", sections: [], football: true, sundayFree: false };

/** What the API answers · the profile plus who this is. */
export type Me = { profile: Profile; primary: boolean; email: string | null; name: string };

export function parseProfile(json: string | null | undefined, base: Profile): Profile {
  if (!json) return base;
  try {
    const p = JSON.parse(json) as Partial<Profile>;
    if (!p || typeof p !== "object") return base;
    return {
      onboarded: typeof p.onboarded === "boolean" ? p.onboarded : base.onboarded,
      name: typeof p.name === "string" ? p.name.slice(0, 40) : base.name,
      about: typeof p.about === "string" ? p.about.slice(0, 400) : base.about,
      sections: Array.isArray(p.sections) ? (p.sections.filter((s): s is Section => (SECTIONS as string[]).includes(String(s)))) : base.sections,
      football: typeof p.football === "boolean" ? p.football : base.football,
      sundayFree: typeof p.sundayFree === "boolean" ? p.sundayFree : base.sundayFree,
    };
  } catch { return base; }
}

export const hasSection = (p: Profile | null | undefined, s: Section) => !!p?.sections.includes(s);
