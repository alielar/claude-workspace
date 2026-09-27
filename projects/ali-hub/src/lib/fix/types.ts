/**
 * Fix chat (2026-09-27) · Ali types what he wants changed (with screenshots) inside the app;
 * a job on his Mac (`fix-worker/worker.mjs`) picks the queue up, runs Claude Code headless in
 * this repository, ships, and writes a plain-language reply back into the chat.
 *
 * Shapes shared by the page, the API and the worker.
 */

export type FixStatus = "queued" | "building" | "shipped" | "failed" | "skipped";

export type FixRequest = {
  id: number;
  clientId: string;
  text: string;
  /** Data URLs · only sent for the newest few requests (the list stays light). */
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
export const STATUSES: FixStatus[] = ["queued", "building", "shipped", "failed", "skipped"];

export const newFixId = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
