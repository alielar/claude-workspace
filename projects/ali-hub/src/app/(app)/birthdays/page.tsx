"use client";

/**
 * /birthdays · names and dates worth remembering, reached from To-do → Docs → Birthdays
 * (same pattern as the password vault). Name + a yearly date; a push goes out once,
 * `remindDaysBefore` days ahead of each occurrence (default 3, editable per person) ·
 * see /api/reminders/tick. Today shows the nearest one inside its window.
 *
 * Local-first: renders from the phone's copy, works offline, syncs later.
 */

import { useState } from "react";
import Link from "next/link";
import { openPicker } from "../todo/sheet";
import { useBirthdays } from "@/lib/birthdays/useBirthdays";
import { checklistToday } from "@/lib/checklist/day";
import {
  DEFAULT_REMIND_DAYS, REMIND_OPTIONS, daysUntil, fmtBirthdayDate, fmtDaysUntil,
  sortByUpcoming, turningAge, type Birthday,
} from "@/lib/birthdays/types";

type Form = { name: string; date: string; knowYear: boolean; remindDaysBefore: number; notes: string };

const EMPTY_FORM: Form = { name: "", date: "", knowYear: false, remindDaysBefore: DEFAULT_REMIND_DAYS, notes: "" };

function toForm(b: Birthday): Form {
  const y = b.year ?? 2000;
  return {
    name: b.name, date: `${y}-${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}`,
    knowYear: b.year !== null, remindDaysBefore: b.remindDaysBefore, notes: b.notes ?? "",
  };
}

function remindLabel(n: number): string {
  if (n === 0) return "On the day";
  if (n === 1) return "1 day before";
  return `${n} days before`;
}

function FormFields({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input className="cc-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="Name" autoFocus style={{ fontSize: 16, minHeight: 46 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
        <input type="date" className="cc-input" value={form.date} onClick={openPicker}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          style={{ fontSize: 16, minHeight: 46, width: "100%", boxSizing: "border-box", WebkitAppearance: "none", appearance: "none" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={form.knowYear} onChange={(e) => setForm({ ...form, knowYear: e.target.checked })} style={{ width: 18, height: 18 }} />
          know the year
        </label>
      </div>
      <select className="cc-input" value={form.remindDaysBefore} onChange={(e) => setForm({ ...form, remindDaysBefore: Number(e.target.value) })}
        style={{ fontSize: 16, minHeight: 46 }}>
        {REMIND_OPTIONS.map((n) => <option key={n} value={n}>{remindLabel(n)}</option>)}
      </select>
      <textarea className="cc-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Gift ideas, notes… (optional)" rows={2} style={{ fontSize: 15.5, resize: "vertical" }} />
    </div>
  );
}

export default function BirthdaysPage() {
  const { data, loading, stale, upsert, add, remove } = useBirthdays();
  const today = checklistToday();
  const list = sortByUpcoming(data?.birthdays ?? [], today);

  const [openId, setOpenId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Form>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<Form>(EMPTY_FORM);

  const parse = (f: Form) => {
    const [y, m, d] = f.date.split("-").map(Number);
    return { month: m, day: d, year: f.knowYear ? y : null };
  };

  const openRow = (b: Birthday) => {
    if (openId === b.clientId) { setOpenId(null); return; }
    setOpenId(b.clientId);
    setEditForm(toForm(b));
  };

  const saveEdit = (b: Birthday) => {
    if (!editForm.name.trim() || !editForm.date) return;
    const { month, day, year } = parse(editForm);
    upsert({ ...b, name: editForm.name.trim(), month, day, year, remindDaysBefore: editForm.remindDaysBefore, notes: editForm.notes.trim() || null });
    setOpenId(null);
  };

  const submitAdd = () => {
    if (!addForm.name.trim() || !addForm.date) return;
    const { month, day, year } = parse(addForm);
    add({ name: addForm.name, month, day, year, remindDaysBefore: addForm.remindDaysBefore, notes: addForm.notes.trim() || null });
    setAddForm(EMPTY_FORM);
    setAdding(false);
  };

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 560 }}>
      <Link href="/todo" style={{ fontSize: 14, color: "var(--ink-3)", textDecoration: "none" }}>‹ Docs</Link>

      <div className="cc-pagetitle" style={{ marginBottom: 0, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Birthdays</h1>
          <div className="sub">{list.length ? `${list.length} remembered` : "names and dates worth remembering"}{stale ? " · showing saved copy" : ""}</div>
        </div>
        <button className="cc-btn cc-btn-primary" onClick={() => { setAddForm(EMPTY_FORM); setAdding(true); }} style={{ minHeight: 44, borderRadius: 12 }}>+ Add</button>
      </div>

      <section className="cc-card">
        <div style={{ padding: "0 14px" }}>
          {loading && !data && [0, 1].map((i) => <div key={i} className="cc-skeleton" style={{ height: 56, margin: "10px 0" }} />)}
          {!loading && list.length === 0 && (
            <div style={{ padding: "16px 0", fontSize: 15, color: "var(--ink-3)" }}>
              {data ? "Nothing yet. Add the first one above." : "Couldn't load the list. It will show once you're back online."}
            </div>
          )}
          {list.map((b, i) => {
            const open = openId === b.clientId;
            const days = daysUntil(b, today);
            const age = turningAge(b, today);
            return (
              <div key={b.clientId} style={{ borderBottom: i < list.length - 1 ? "1px solid var(--line)" : "none" }}>
                <button onClick={() => openRow(b)} aria-expanded={open}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", width: "100%", minHeight: 60, padding: "10px 2px", background: "transparent", border: "none", color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.3 }}>{b.name}</span>
                    <span style={{ display: "block", fontSize: 14, color: "var(--ink-3)", marginTop: 2 }}>
                      {fmtBirthdayDate(b)}{age !== null ? ` · turns ${age}` : ""}
                    </span>
                  </span>
                  <span style={{ fontSize: 14, color: days <= b.remindDaysBefore ? "var(--violet)" : "var(--ink-3)", fontWeight: days <= b.remindDaysBefore ? 600 : 400, whiteSpace: "nowrap" }}>
                    {fmtDaysUntil(days)}
                  </span>
                </button>
                {open && (
                  <div style={{ display: "grid", gap: 12, padding: "2px 2px 16px" }}>
                    <FormFields form={editForm} setForm={setEditForm} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                      <button className="cc-btn cc-btn-primary" onClick={() => saveEdit(b)} style={{ minHeight: 46, borderRadius: 12, fontSize: 16 }}>Save</button>
                      <button className="cc-btn cc-btn-ghost" onClick={() => { if (confirm(`Remove ${b.name}?`)) { remove(b); setOpenId(null); } }} style={{ minHeight: 46, minWidth: 46, borderRadius: 12, padding: 0, color: "var(--neg)" }} aria-label="Remove">✕</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {adding && (
        <>
          <div onClick={() => setAdding(false)} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.5)" }} />
          <div role="dialog" aria-label="Add a birthday" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "var(--bg-chrome)", borderTop: "1px solid var(--line-hi)", borderRadius: "20px 20px 0 0", padding: "16px 20px calc(env(safe-area-inset-bottom) + 16px)", display: "grid", gap: 12, maxWidth: 560, margin: "0 auto" }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Add a birthday</div>
            <FormFields form={addForm} setForm={setAddForm} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button className="cc-btn cc-btn-ghost" onClick={() => setAdding(false)} style={{ minHeight: 48, borderRadius: 12 }}>Cancel</button>
              <button className="cc-btn cc-btn-primary" onClick={submitAdd} disabled={!addForm.name.trim() || !addForm.date} style={{ minHeight: 48, borderRadius: 12, fontSize: 16 }}>Add</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
