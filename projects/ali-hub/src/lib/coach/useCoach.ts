"use client";

/** The coach's cached feed (objectives + the list of reports) with optimistic objective edits through the outbox. */

import { useCallback } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import type { Objective } from "./types";

export type CoachFeed = { objectives: Objective[]; reports: { week: string; from: string; to: string; headline: string; createdAt: number }[]; latest: { week: string; from: string; to: string; headline: string; createdAt: number } | null };

export function useCoach() {
  const { data, loading, setData, refresh } = useCached<CoachFeed>("coach", () => fetchJson<CoachFeed>("/api/coach"));
  const saveObjective = useCallback(async (o: Objective, remove = false) => {
    const next = { ...o, updatedAt: Date.now() };
    setData((prev) => {
      const list = (prev?.objectives ?? []).filter((x) => x.id !== o.id);
      return { objectives: remove ? list : [...list, next].sort((a, b) => a.due.localeCompare(b.due)), reports: prev?.reports ?? [], latest: prev?.latest ?? null };
    });
    try { await sendOrQueue({ url: "/api/coach", method: "PUT", body: { ...next, deleted: remove }, dedupeKey: `coach-objective:${o.id}` }); } catch { /* next refresh shows the truth */ }
  }, [setData]);
  return { data, loading, saveObjective, refresh };
}
