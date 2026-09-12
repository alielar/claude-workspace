/**
 * Mobility (stretch) music · 10 tracks, self-hosted in /public/music.
 * 2026-09-11 (Ali): "Embracing the Sunrise" is the reference sound · epic, melodic,
 * neoclassical, made for a morning. Four calm/bland Kevin MacLeod tracks (Calmant,
 * Meditation Impromptu 01, Frozen Star, Ashton Manor) are out; in their place four
 * more Kai Engel pieces in the same vein: three from the SAME album ("Calls and
 * Echoes", 2014 · described by Kai Engel as the move towards epic trailer music
 * with the neoclassical approach) and one from its follow-up "Deathless".
 * Every track is Creative Commons; the exact license is in `by` and shown in the
 * picker — that attribution is the license condition, keep it.
 */

export type StretchTrack = { slug: string; title: string; by: string };

export const STRETCH_TRACKS: StretchTrack[] = [
  // Kai Engel · epic neoclassical (the "Embracing the Sunrise" style)
  { slug: "sunrise",          title: "Embracing the Sunrise",   by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "calls-and-echoes", title: "Calls and Echoes",        by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "fairytale",        title: "Fairytale",               by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "lights-came-on",   title: "When the Lights Came On", by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "celestial-plains", title: "Celestial Plains",        by: "Kai Engel · Deathless: The Renaissance · CC BY-NC-SA 3.0" },
  // Other styles, kept
  { slug: "reverie",        title: "Reverie",                by: "Scott Buckley · cinematic ambient · CC BY 4.0" },
  { slug: "surreal-forest", title: "Surreal Forest",         by: "Meydän · ambient electronic · CC BY 4.0" },
  { slug: "handpan-mist",   title: "Mist",                   by: "Oles Deyneka · handpan · CC BY-SA 3.0" },
  { slug: "serenity",       title: "Serenity",               by: "Jason Shaw · acoustic guitar · audionautix.com · CC BY 4.0" },
  { slug: "gymnopedie",     title: "Gymnopédie No. 1",       by: "Erik Satie · Kevin MacLeod · CC BY 4.0" },
];

export const trackUrl = (slug: string) => `/music/${slug}.mp3`;
