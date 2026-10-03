"use client";

import { useCallback, useState } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import type { MindPart, MindSession, MindToday } from "./types";

export function useMind() {
  const c = useCached<MindToday>("mind-today", () => fetchJson<MindToday>("/api/mind/today"));
  const [writing, setWriting] = useState(false);

  /** Ask the server to write today's brief now (≈ 20 s) · `swap` drops the waiting one first. */
  const writeBrief = useCallback(async (swap = false) => {
    setWriting(true);
    try { const d = await fetchJson<MindToday>(swap ? "/api/mind/today?swap=1" : "/api/mind/today?make=1"); if (d) { c.setData(d); c.markEdit(); } }
    catch { /* shown as still empty · tap again */ }
    finally { setWriting(false); }
  }, [c]);

  /** Upload one recording · the answer is the graded session. */
  const grade = useCallback(async (part: MindPart, topicId: number, audio: Blob): Promise<MindSession | { error: string }> => {
    const fd = new FormData();
    fd.append("audio", audio, audio.type.includes("webm") ? "talk.webm" : "talk.m4a");
    fd.append("part", part);
    fd.append("topicId", String(topicId));
    let res: Response;
    try { res = await fetch("/api/mind/grade", { method: "POST", body: fd }); }
    catch { return { error: "No connection · the recording was not sent" }; }
    const j = (await res.json().catch(() => ({ error: `Server answered ${res.status}` }))) as MindSession | { error: string };
    if (!res.ok || "error" in j) return "error" in j ? j : { error: `Server answered ${res.status}` };
    c.setData((prev) => ({ ...(prev ?? j as unknown as MindToday), done: { ...(prev?.done ?? { callback: null, new: null }), [part]: j }, callback: part === "callback" ? null : prev?.callback ?? null }));
    c.markEdit();
    c.refresh();
    return j;
  }, [c]);

  /** No more callbacks for one topic (idempotent: sets next_due to nothing). */
  const retire = useCallback(async (topicId: number) => {
    if (c.data) c.setData((prev) => ({ ...(prev ?? c.data!), callback: prev?.callback?.id === topicId ? null : prev?.callback ?? null, topics: (prev ?? c.data!).topics.map((t) => (t.id === topicId ? { ...t, nextDue: null } : t)) }));
    try {
      const res = await fetch("/api/mind/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retire: topicId }) });
      if (res.ok) { c.setData((await res.json()) as MindToday); c.markEdit(); }
    } catch { c.refresh(); }
  }, [c]);

  /** Not today · the callback is due again tomorrow, the new topic alone makes the session. */
  const skip = useCallback(async (topicId: number) => {
    if (c.data) c.setData((prev) => ({ ...(prev ?? c.data!), callback: prev?.callback?.id === topicId ? null : prev?.callback ?? null }));
    try {
      const res = await fetch("/api/mind/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skip: topicId }) });
      if (res.ok) { c.setData((await res.json()) as MindToday); c.markEdit(); }
    } catch { c.refresh(); }
  }, [c]);

  return { ...c, writing, writeBrief, grade, retire, skip };
}
