"use client";

/**
 * Local-first to-dos. The phone's copy is the truth you see; every change is
 * written locally first and sent as a full upsert through the outbox.
 */

import { useCallback, useEffect } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
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

export function useTodos(today: string) {
  const q = useCached<TodosData>(TODOS_KEY, () => fetchJson<TodosData>("/api/todos"));
  const { setData } = q;

  // Keep the badge in step with what's on the phone.
  useEffect(() => {
    if (q.data) setAppBadge(badgeCount(q.data.todos, today));
  }, [q.data, today]);

  const upsert = useCallback(async (t: Todo) => {
    const next = { ...t, updatedAt: Date.now() };
    setData((prev) => {
      const list = (prev?.todos ?? []).filter((x) => x.clientId !== t.clientId);
      return { todos: next.deleted ? list : [...list, next] };
    });
    try {
      await sendOrQueue({ url: "/api/todos", method: "PUT", body: next, dedupeKey: `todo:${t.clientId}` });
    } catch { /* server refused — the next refresh shows the truth */ }
  }, [setData]);

  const add = useCallback((partial: Partial<Todo> & { title: string }) => {
    const now = Date.now();
    const t: Todo = {
      clientId: newTodoId(), title: partial.title.trim(), notes: partial.notes ?? null, project: partial.project ?? null,
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
