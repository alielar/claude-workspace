"use client";

/** Local-first birthdays: cached read, optimistic edits, writes through the outbox. */

import { useCallback } from "react";
import { useCached, fetchJson } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { DEFAULT_REMIND_DAYS, newBirthdayId, type Birthday, type BirthdaysData } from "@/lib/birthdays/types";

export const BIRTHDAYS_KEY = "birthdays";

export function useBirthdays() {
  const q = useCached<BirthdaysData>(BIRTHDAYS_KEY, () => fetchJson<BirthdaysData>("/api/birthdays"));
  const { setData } = q;

  const upsert = useCallback(async (b: Birthday) => {
    const next = { ...b, updatedAt: Date.now() };
    setData((prev) => {
      const list = (prev?.birthdays ?? []).filter((x) => x.clientId !== b.clientId);
      return { birthdays: next.deleted ? list : [...list, next] };
    });
    try {
      await sendOrQueue({ url: "/api/birthdays", method: "PUT", body: next, dedupeKey: `birthday:${b.clientId}` });
    } catch { /* server refused · the next refresh shows the truth */ }
  }, [setData]);

  const add = useCallback((partial: Partial<Birthday> & { name: string; month: number; day: number }) => {
    const now = Date.now();
    const b: Birthday = {
      clientId: newBirthdayId(), name: partial.name.trim(), month: partial.month, day: partial.day,
      year: partial.year ?? null, remindDaysBefore: partial.remindDaysBefore ?? DEFAULT_REMIND_DAYS, notes: partial.notes ?? null,
      createdAt: now, updatedAt: now, deleted: false,
    };
    return upsert(b);
  }, [upsert]);

  const remove = useCallback((b: Birthday) => upsert({ ...b, deleted: true }), [upsert]);

  return { ...q, upsert, add, remove };
}
