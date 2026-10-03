/**
 * Mobility (stretch) music · the EPIC shelf, self-hosted in /public/music.
 *
 * 2026-10-03 (Ali): "keep only the 2-3 most uplifting, epic tracks · add more in that same style ·
 * no picker, play a random one, never repeat within a session". Kept from the old library:
 * "Embracing the Sunrise" (his reference sound since 2026-09-11), "Calls and Echoes" and
 * "Celestial Plains" · the three that are plainly epic trailer neoclassical. Added, same composer,
 * same two albums (archive.org SCL115 / SCL125, CC BY-NC-SA): "The Flames of Rome", "Disciples of
 * Steel", "The Price of Valour", "Avenge the Fallen".
 *
 * Out of the rotation (files kept for Train's mobility shelf and for a rollback): "Fairytale",
 * "When the Lights Came On" · the five other-style tracks (Reverie, Surreal Forest, Mist,
 * Serenity, Gymnopédie) were removed with their files, git has them.
 *
 * Every track is Creative Commons; the exact license is in `by` · that attribution is the
 * license condition, keep it wherever a title is shown.
 */

export type StretchTrack = { slug: string; title: string; by: string };

export const STRETCH_TRACKS: StretchTrack[] = [
  { slug: "sunrise",            title: "Embracing the Sunrise",  by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "calls-and-echoes",   title: "Calls and Echoes",       by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "celestial-plains",   title: "Celestial Plains",       by: "Kai Engel · Deathless: The Renaissance · CC BY-NC-SA 4.0" },
  { slug: "flames-of-rome",     title: "The Flames of Rome",     by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "disciples-of-steel", title: "Disciples of Steel",     by: "Kai Engel · Deathless: The Renaissance · CC BY-NC-SA 4.0" },
  { slug: "price-of-valour",    title: "The Price of Valour",    by: "Kai Engel · Deathless: The Renaissance · CC BY-NC-SA 4.0" },
  { slug: "avenge-the-fallen",  title: "Avenge the Fallen",      by: "Kai Engel · Deathless: The Renaissance · CC BY-NC-SA 4.0" },
];

/** Still on disk, not in the mobility rotation · Train's mobility shelf may use them. */
export const BENCHED_TRACKS: StretchTrack[] = [
  { slug: "fairytale",        title: "Fairytale",               by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
  { slug: "lights-came-on",   title: "When the Lights Came On", by: "Kai Engel · Calls and Echoes · CC BY-NC-SA 4.0" },
];

export const trackUrl = (slug: string) => `/music/${slug}.mp3`;
