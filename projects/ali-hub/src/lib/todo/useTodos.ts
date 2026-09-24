"use client";

/**
 * Local-first to-dos. The phone's copy is the truth you see; every change is
 * written locally first and sent as a full upsert through the outbox.
 */

import { useCallback, useEffect } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue, outboxHas } from "@/lib/local/outbox";
import { badgeCount, newTodoId, type Todo, type TodosData } from "@/lib/todo/types";

export const TODOS_KEY = "todos";

/** Home-screen badge = tasks due today or overdue. Silent no-op where unsupported. */
export function setAppBadge(n: number) {
  try {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) nav.setAppBadge?.(n).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  } catch { /* unsupported */ }
}

/**
 * Server rows meet local rows: per task the newer `updatedAt` wins, so a GET that raced a PUT
 * (or one that answered from an old server copy) can never undo an edit made on this phone.
 * A task deleted here (and not yet confirmed) is remembered as a tombstone for the same reason.
 */
const TOMBSTONES_KEY = "cc:v1:todos-gone";
function readTombstones(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TOMBSTONES_KEY) || "{}") as Record<string, number>; } catch { return {}; }
}
function addTombstone(clientId: string, at: number) {
  try {
    const t = readTombstones(); t[clientId] = at;
    const cutoff = Date.now() - 14 * 86400000;
    for (const k of Object.keys(t)) if (t[k] < cutoff) delete t[k];
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(t));
  } catch { /* ignore */ }
}
export function mergeTodos(local: TodosData | null, server: TodosData): TodosData {
  if (!local) return server;
  const gone = readTombstones();
  const mine = new Map(local.todos.map((t) => [t.clientId, t]));
  const out: Todo[] = [];
  for (const s of server.todos) {
    const g = gone[s.clientId];
    if (g && g >= s.updatedAt) continue;
    const l = mine.get(s.clientId);
    out.push(l && l.updatedAt > s.updatedAt ? l : s);
    mine.delete(s.clientId);
  }
  // Left over locally: created here and not on the server yet (PUT in flight, or queued while
  // offline) · keep those; anything else the server dropped (done over a week ago, deleted
  // from another device) goes.
  const recent = Date.now() - 3 * 60_000;
  for (const l of mine.values()) if (l.updatedAt > recent || outboxHas(`todo:${l.clientId}`)) out.push(l);
  return { todos: out };
}

export function useTodos(today: string) {
  const q = useCached<TodosData>(TODOS_KEY, () => fetchJson<TodosData>("/api/todos"), { merge: mergeTodos });
  const { setData, markEdit } = q;

  // Keep the badge in step with what's on the phone.
  useEffect(() => {
    if (q.data) setAppBadge(badgeCount(q.data.todos, today));
  }, [q.data, today]);

  const upsert = useCallback(async (t: Todo) => {
    const next = { ...t, updatedAt: Date.now() };
    if (next.deleted) addTombstone(t.clientId, next.updatedAt);
    setData((prev) => {
      const list = (prev?.todos ?? []).filter((x) => x.clientId !== t.clientId);
      return { todos: next.deleted ? list : [...list, next] };
    });
    try {
      await sendOrQueue({ url: "/api/todos", method: "PUT", body: next, dedupeKey: `todo:${t.clientId}` });
    } catch { /* server refused · the next refresh shows the truth */ }
    finally { markEdit(); } // a GET that started while this PUT was in flight is stale · drop it
  }, [setData, markEdit]);

  const add = useCallback((partial: Partial<Todo> & { title: string }) => {
    const now = Date.now();
    const t: Todo = {
      clientId: newTodoId(), title: partial.title.trim(), area: partial.area ?? "personal", notes: partial.notes ?? null, project: partial.project ?? null,
      dueDate: partial.dueDate ?? null, dueTime: partial.dueTime ?? null, evening: partial.evening ?? false,
      someday: partial.someday ?? false, priority: partial.priority ?? 0, sortOrder: now, doneAt: null,
      createdAt: now, updatedAt: now, deleted: false,
    };
    return upsert(t);
  }, [upsert]);

  const toggleDone = useCallback((t: Todo) => upsert({ ...t, doneAt: t.doneAt ? null : Date.now() }), [upsert]);
  const remove = useCallback((t: Todo) => upsert({ ...t, deleted: true }), [upsert]);

  return { ...q, upsert, add, toggleDone, remove };
}
