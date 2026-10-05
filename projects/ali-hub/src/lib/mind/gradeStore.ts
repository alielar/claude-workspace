"use client";

/**
 * Grading runs OUTSIDE the recorder screen (Ali 2026-10-05: "when I stop recording you keep me on
 * the page · I want to move out and come back when the grading is ready"). The Stop button hands
 * the audio to this store and closes the screen at once; the upload and the grade run here, in
 * the background of the app, and the result lands in the Mind cache (every open Mind pane refreshes
 * through the same event the outbox uses). A push from the server says when it is graded.
 *
 * If the upload fails (no connection, the app was put away mid-send on iOS) the audio stays in
 * memory and the card offers "Send again"; the audio is gone only if iOS kills the app. When the
 * server did store the session but the answer never came back, the next refresh shows it and the
 * pending job is dropped (MindPane does that).
 */

import { useSyncExternalStore } from "react";
import { readCache, writeCache } from "@/lib/local/store";
import type { MindPart, MindSession, MindToday } from "@/lib/mind/types";

export type GradeJob = { part: MindPart; topicId: number; topicTitle: string; blob: Blob; state: "sending" | "error"; error?: string; startedAt: number };

let jobs: GradeJob[] = [];
const subs = new Set<() => void>();
const emit = () => { for (const s of subs) s(); };
const set = (next: GradeJob[]) => { jobs = next; emit(); };

export function useGradeJobs(): GradeJob[] {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => jobs, () => jobs);
}

async function send(job: GradeJob) {
  const fd = new FormData();
  fd.append("audio", job.blob, job.blob.type.includes("webm") ? "talk.webm" : "talk.m4a");
  fd.append("part", job.part);
  fd.append("topicId", String(job.topicId));
  let res: Response;
  try { res = await fetch("/api/mind/grade", { method: "POST", body: fd }); }
  catch { set(jobs.map((j) => (j === job ? { ...j, state: "error", error: "No connection · the recording was not sent" } : j))); return; }
  const j = (await res.json().catch(() => ({ error: `Server answered ${res.status}` }))) as MindSession | { error: string };
  if (!res.ok || "error" in j) { set(jobs.map((x) => (x === job ? { ...x, state: "error", error: "error" in j ? j.error : `Server answered ${res.status}` } : x))); return; }
  // Into the phone's copy of today, then every Mind pane refreshes from the server.
  const cached = readCache<MindToday>("mind-today");
  if (cached) writeCache("mind-today", { ...cached.data, done: { ...cached.data.done, [job.part]: j }, callback: job.part === "callback" ? null : cached.data.callback });
  set(jobs.filter((x) => x !== job));
  try { window.dispatchEvent(new Event("cc:outbox-flushed")); } catch { /* ignore */ }
}

/** Hand a finished recording over and return at once · one job per part at a time (a retry replaces the failed one). */
export function enqueueGrade(part: MindPart, topicId: number, topicTitle: string, blob: Blob) {
  const job: GradeJob = { part, topicId, topicTitle, blob, state: "sending", startedAt: Date.now() };
  set([...jobs.filter((j) => j.part !== part), job]);
  void send(job);
}

/** Send a failed job again · the audio is still here. */
export function retryGrade(part: MindPart) {
  const job = jobs.find((j) => j.part === part && j.state === "error");
  if (!job) return;
  const fresh: GradeJob = { ...job, state: "sending", error: undefined, startedAt: Date.now() };
  set(jobs.map((j) => (j === job ? fresh : j)));
  void send(fresh);
}

/** Drop a job (the server already has the session, or Ali gives up on this take). */
export function dropGrade(part: MindPart) { set(jobs.filter((j) => j.part !== part)); }
