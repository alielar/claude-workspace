/**
 * Stretching music · 10 calm tracks across five styles, self-hosted in /public/music.
 * Refreshed 2026-09-08: five Kevin MacLeod tracks swapped for five different artists
 * and genres (ambient electronic, neoclassical piano, handpan, cinematic ambient,
 * acoustic guitar). Every track is Creative Commons; the exact license is in `by`
 * and shown in the picker — that attribution is the license condition, keep it.
 */

export type StretchTrack = { slug: string; title: string; by: string };

export const STRETCH_TRACKS: StretchTrack[] = [
  // New styles (2026-09-08)
  { slug: "surreal-forest", title: "Surreal Forest",         by: "Meydän · ambient electronic · CC BY 4.0" },
  { slug: "sunrise",        title: "Embracing the Sunrise",  by: "Kai Engel · neoclassical piano · CC BY-NC-SA 4.0" },
  { slug: "handpan-mist",   title: "Mist",                   by: "Oles Deyneka · handpan · CC BY-SA 3.0" },
  { slug: "reverie",        title: "Reverie",                by: "Scott Buckley · cinematic ambient · CC BY 4.0" },
  { slug: "serenity",       title: "Serenity",               by: "Jason Shaw · acoustic guitar · audionautix.com · CC BY 4.0" },
  // Kept from the original library
  { slug: "gymnopedie",   title: "Gymnopédie No. 1",        by: "Erik Satie · Kevin MacLeod · CC BY 4.0" },
  { slug: "meditation-1", title: "Meditation Impromptu 01", by: "Kevin MacLeod · CC BY 4.0" },
  { slug: "frozen-star",  title: "Frozen Star",             by: "Kevin MacLeod · CC BY 4.0" },
  { slug: "calmant",      title: "Calmant",                 by: "Kevin MacLeod · CC BY 4.0" },
  { slug: "ashton-manor", title: "Ashton Manor",            by: "Kevin MacLeod · CC BY 4.0" },
];

export const trackUrl = (slug: string) => `/music/${slug}.mp3`;
