/**
 * KB Hour music (2026-09-20) · self-hosted in /public/music like the mobility tracks.
 * Two shelves: Ali's mobility favourites (his reference sound, "Embracing the Sunrise",
 * plus the Kai Engel pieces picked to match it · the mobility player keeps no play
 * counts, so "most-listened" = the ones he chose) and six harder, driving Kevin MacLeod
 * tracks for a 40-minute kettlebell session. Every track is Creative Commons; the
 * attribution in `by` is the license condition · keep it visible in the picker.
 */

import { STRETCH_TRACKS, trackUrl, type StretchTrack } from "@/lib/routine/music";

export type TrainTrack = StretchTrack & { shelf: "drive" | "mobility" };

const DRIVE: TrainTrack[] = [
  { slug: "volatile-reaction", title: "Volatile Reaction", by: "Kevin MacLeod · hard rock · incompetech.com · CC BY 4.0", shelf: "drive" },
  { slug: "gearhead",          title: "Gearhead",          by: "Kevin MacLeod · heavy rock · incompetech.com · CC BY 4.0", shelf: "drive" },
  { slug: "exhilarate",        title: "Exhilarate",        by: "Kevin MacLeod · driving electronic · incompetech.com · CC BY 4.0", shelf: "drive" },
  { slug: "rocket",            title: "Rocket",            by: "Kevin MacLeod · rock · incompetech.com · CC BY 4.0", shelf: "drive" },
  { slug: "cut-and-run",       title: "Cut and Run",       by: "Kevin MacLeod · action · incompetech.com · CC BY 4.0", shelf: "drive" },
  { slug: "hitman",            title: "Hitman",            by: "Kevin MacLeod · dark electronic · incompetech.com · CC BY 4.0", shelf: "drive" },
];

const MOBILITY_PICKS = ["sunrise", "calls-and-echoes", "fairytale", "lights-came-on", "celestial-plains"];

export const TRAIN_TRACKS: TrainTrack[] = [
  ...DRIVE,
  ...STRETCH_TRACKS.filter((t) => MOBILITY_PICKS.includes(t.slug)).map((t) => ({ ...t, shelf: "mobility" as const })),
];

export { trackUrl };
export const TRAIN_TRACK_KEY = "cc-train-track";   // localStorage: chosen slug | "off"
