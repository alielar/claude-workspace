"use client";

/**
 * /todo/entry/<clientId> · one Knowledge entry, FULL SCREEN (Ali 2026-10-03: "tapping an entry
 * opens it full screen, not in a small box · a Document should feel like a page in Apple Notes").
 * The phone's way in; on the laptop /knowledge opens the same view in a pane beside the list.
 * The view itself lives in `../EntryView.tsx`. Edit opens the Knowledge sheet in place.
 * Reads the phone's copy of the list (useTodos) · instant, works offline, edits go through the outbox.
 */

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTodos } from "@/lib/todo/useTodos";
import { checklistToday } from "@/lib/checklist/day";
import { ListSheet } from "../../sheet";
import { EntryView } from "../EntryView";

export default function EntryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const today = checklistToday();
  const { data, loading, upsert, remove } = useTodos(today);
  const t = (data?.todos ?? []).find((x) => x.clientId === params.id && !x.deleted) ?? null;
  const [editing, setEditing] = useState(false);

  if (!t) {
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
        <Link href="/knowledge" style={{ color: "var(--ink-3)", textDecoration: "none", fontSize: 15, minHeight: 44, display: "inline-flex", alignItems: "center" }}>← Knowledge</Link>
        {loading && !data ? <div className="cc-skeleton" style={{ height: 120, borderRadius: 14 }} /> : <div style={{ color: "var(--ink-3)", fontSize: 15 }}>This entry is gone.</div>}
      </div>
    );
  }

  return (
    <>
      <EntryView t={t} today={today} onSave={upsert} onEdit={() => setEditing(true)}
        onClose={() => { if (window.history.length > 1) router.back(); else router.push("/knowledge"); }} />
      {editing && (
        <ListSheet t={t} today={today} onSave={upsert} onDelete={() => { remove(t); router.replace("/knowledge"); }} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
