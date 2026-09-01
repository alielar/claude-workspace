/**
 * Stretching music — 10 calm/gently-rhythmic tracks, self-hosted in /public/music.
 * All by Kevin MacLeod (incompetech.com), licensed CC BY 4.0 — legal to play and
 * redistribute with attribution (shown in the picker). Gymnopédie is Erik Satie
 * (public domain composition), MacLeod's recording.
 */

export type StretchTrack = { slug: string; title: string; by: string };

export const STRETCH_TRACKS: StretchTrack[] = [
  { slug: "gymnopedie",   title: "Gymnopédie No. 1",        by: "Erik Satie · Kevin MacLeod" },
  { slug: "meditation-1", title: "Meditation Impromptu 01", by: "Kevin MacLeod" },
  { slug: "meditation-2", title: "Meditation Impromptu 02", by: "Kevin MacLeod" },
  { slug: "meditation-3", title: "Meditation Impromptu 03", by: "Kevin MacLeod" },
  { slug: "healing",      title: "Healing",                 by: "Kevin MacLeod" },
  { slug: "dreams",       title: "Dreams Become Real",      by: "Kevin MacLeod" },
  { slug: "frozen-star",  title: "Frozen Star",             by: "Kevin MacLeod" },
  { slug: "calmant",      title: "Calmant",                 by: "Kevin MacLeod" },
  { slug: "carefree",     title: "Carefree",                by: "Kevin MacLeod" },
  { slug: "ashton-manor", title: "Ashton Manor",            by: "Kevin MacLeod" },
];

export const trackUrl = (slug: string) => `/music/${slug}.mp3`;
