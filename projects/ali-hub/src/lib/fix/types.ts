/**
 * R2-D2 (built as ALAI 2026-09-27, renamed 2026-10-03) · Ali types what he wants changed (with screenshots) inside the app; the
 * messages wait ("held") until he taps Ship now; then a job on his Mac (`fix-worker/worker.mjs`)
 * takes everything released as one batch, runs Claude Code headless in this repository, ships,
 * and writes a plain-language reply back into the chat.
 *
 * Shapes shared by the page, the API and the worker.
 */

/** held = written, waiting for Ali's "Ship now" (the default) · queued = released, the Mac may take it. */
export type FixStatus = "held" | "queued" | "building" | "shipped" | "failed" | "skipped";

export type FixRequest = {
  id: number;
  clientId: string;
  text: string;
  /** Data URLs · only on a request the phone just composed; the feed carries counts and the
   *  page loads each picture from /api/fix/image?id=&i= (2026-10-03). */
  images: string[] | null;
  imageCount: number;
  status: FixStatus;
  reply: string | null;
  commitSha: string | null;
  batchId: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type FixFeed = {
  requests: FixRequest[];
  /** The Mac job's last poll · null = it has never connected. */
  worker: { seenAt: number | null; note: string | null };
};

export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 600_000;   // per data URL, after the phone shrank it
export const MAX_TEXT = 4000;
export const STATUSES: FixStatus[] = ["held", "queued", "building", "shipped", "failed", "skipped"];

export const newFixId = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
