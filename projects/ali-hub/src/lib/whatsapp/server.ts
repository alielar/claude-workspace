/**
 * WhatsApp reminders through CallMeBot (2026-10-10 · Ali's father: "the to-dos on WhatsApp").
 *
 * CallMeBot is a free personal service: the person adds its number as a contact, sends it one
 * activation message, gets an API key back, and from then on
 *   GET https://api.callmebot.com/whatsapp.php?phone=+2126…&text=…&apikey=…
 * delivers a WhatsApp message to that one number. No account, no cost. The title of each to-do and
 * the phone number pass through CallMeBot; there is no uptime promise. Personal use only.
 *
 * Per account: `user_settings.whatsapp` = { phone, apikey, digestDay, eveningDay, lastSentAt, lastError }.
 * When it is set, WhatsApp REPLACES the phone push for that account's to-dos (the tick skips the nags).
 *
 * THE RULES (Ali 2026-10-10: one message per to-do when due, one follow-up, then silence):
 *   09:00  one morning list: everything due today, then anything overdue · nothing if nothing is due.
 *   HH:MM  a to-do with an hour gets one message at its hour, and ONE more an hour later if still open.
 *   19:00  one evening list of what is still open today · nothing if all is done.
 *   Quiet 23:00–08:00 like every reminder. `todos.wa_state` remembers what a to-do already got;
 *   a changed day or hour starts it over.
 */

import { db } from "@/db";
import { todos, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSettingsColumns, ensureTodoColumns } from "@/lib/db/ensureColumns";

export const CALLMEBOT_NUMBER = "+34 644 95 73 56";
export const CALLMEBOT_ACTIVATION = "I allow callmebot to send me messages";
export const ACTIVATION_LINK = `https://wa.me/${CALLMEBOT_NUMBER.replace(/\D/g, "")}?text=${encodeURIComponent(CALLMEBOT_ACTIVATION)}`;

export type WaConfig = { phone: string; apikey: string; digestDay?: string; eveningDay?: string; lastSentAt?: number; lastError?: string | null };
export type WaStatus = { on: boolean; phone: string | null; lastSentAt: number | null; lastError: string | null; activationLink: string; number: string; activation: string };

/** "+2126…" (a country code never starts with 0) or the WhatsApp id CallMeBot sometimes activates instead, "1660…@lid" (seen 2026-10-10). */
export const PHONE = /^(\+[1-9]\d{7,14}|\d{6,20}@lid)$/;
export const normalizePhone = (s: string) => /@\s*lid/i.test(s) ? s.replace(/\D/g, "") + "@lid" : "+" + s.replace(/\D/g, "");

export async function getWaConfig(userId: string): Promise<WaConfig | null> {
  await ensureSettingsColumns();
  try {
    const [row] = await db.select({ w: userSettings.whatsapp }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    const c = JSON.parse(row?.w ?? "null") as WaConfig | null;
    return c && PHONE.test(c.phone) && typeof c.apikey === "string" && c.apikey ? c : null;
  } catch { return null; }
}

export async function saveWaConfig(userId: string, c: WaConfig | null): Promise<void> {
  await ensureSettingsColumns();
  const json = c ? JSON.stringify(c) : null;
  const [existing] = await db.select({ id: userSettings.id }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!existing) await db.insert(userSettings).values({ userId, whatsapp: json });
  else await db.update(userSettings).set({ whatsapp: json, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
}

export async function waStatus(userId: string): Promise<WaStatus> {
  const c = await getWaConfig(userId);
  return { on: !!c, phone: c?.phone ?? null, lastSentAt: c?.lastSentAt ?? null, lastError: c?.lastError ?? null, activationLink: ACTIVATION_LINK, number: CALLMEBOT_NUMBER, activation: CALLMEBOT_ACTIVATION };
}

/** One message to the account's number · records the outcome in the config. */
export async function sendWhatsApp(userId: string, text: string, cfg?: WaConfig | null): Promise<{ ok: boolean; error?: string }> {
  const c = cfg ?? (await getWaConfig(userId));
  if (!c) return { ok: false, error: "WhatsApp is not set up" };
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(c.phone)}&text=${encodeURIComponent(text.slice(0, 1500))}&apikey=${encodeURIComponent(c.apikey)}`;
  let result: { ok: boolean; error?: string };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "ali-hub/1.0 (personal reminders)" } });
    const body = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // CallMeBot answers 200 with "Message queued" on success, and 200 or 203 with the reason otherwise.
    const ok = res.ok && /queued|sent|success/i.test(body) && !/error|invalid|not valid|wrong/i.test(body);
    result = ok ? { ok: true } : { ok: false, error: `CallMeBot: ${body.slice(0, 160) || `status ${res.status}`}` };
  } catch (e) {
    result = { ok: false, error: `no answer from CallMeBot (${String((e as Error).message).slice(0, 80)})` };
  }
  await saveWaConfig(userId, { ...c, lastSentAt: result.ok ? Date.now() : c.lastSentAt, lastError: result.ok ? null : result.error ?? "failed" }).catch(() => {});
  return result;
}

type Row = typeof todos.$inferSelect;
type WaState = { due: string; count: number; at: number };
const readState = (t: Row): WaState | null => { try { return t.waState ? (JSON.parse(t.waState) as WaState) : null; } catch { return null; } };
const line = (t: Row) => `• ${t.title}${t.dueTime ? ` · ${t.dueTime}` : ""}`;
const list = (rows: Row[], max = 12) => rows.slice(0, max).map(line).join("\n") + (rows.length > max ? `\n… and ${rows.length - max} more` : "");

/**
 * The to-do messages of one tick for one account (called only outside quiet hours).
 * `due` = not done, not someday, not sleeping, due today or earlier (the same list the push nags use).
 */
export async function whatsappTick(userId: string, due: Row[], today: string, hm: string, now: Date): Promise<{ sent: number; errors: string[] }> {
  await ensureTodoColumns();
  const c = await getWaConfig(userId);
  if (!c) return { sent: 0, errors: ["off"] };
  let cfg = c;
  let sent = 0;
  const errors: string[] = [];
  const send = async (text: string) => {
    const r = await sendWhatsApp(userId, text, cfg);
    cfg = (await getWaConfig(userId)) ?? cfg;
    if (r.ok) sent += 1; else errors.push(r.error ?? "failed");
    return r.ok;
  };
  const todayRows = due.filter((t) => t.dueDate === today);
  const overdue = due.filter((t) => t.dueDate! < today);

  // 09:00 · the morning list, once a day.
  if (hm >= "09:00" && cfg.digestDay !== today) {
    if (todayRows.length || overdue.length) {
      const parts = [];
      if (todayRows.length) parts.push(`Today · ${todayRows.length} to-do${todayRows.length === 1 ? "" : "s"}\n${list(todayRows)}`);
      if (overdue.length) parts.push(`Overdue · ${overdue.length}\n${list(overdue, 6)}`);
      if (await send(parts.join("\n\n"))) await saveWaConfig(userId, { ...cfg, digestDay: today });
    } else await saveWaConfig(userId, { ...cfg, digestDay: today });
    cfg = (await getWaConfig(userId)) ?? cfg;
  }

  // A to-do with an hour · one message at its hour, one follow-up an hour later, then silence.
  for (const t of todayRows) {
    if (!t.dueTime || hm < t.dueTime) continue;
    const key = `${t.dueDate} ${t.dueTime}`;
    const st = readState(t);
    const state: WaState = st && st.due === key ? st : { due: key, count: 0, at: 0 };
    if (state.count === 0) {
      if (await send(`${t.dueTime} · ${t.title}`)) await db.update(todos).set({ waState: JSON.stringify({ due: key, count: 1, at: now.getTime() }) }).where(eq(todos.id, t.id));
    } else if (state.count === 1 && now.getTime() - state.at >= 60 * 60_000) {
      if (await send(`Still open · ${t.title} (${t.dueTime})`)) await db.update(todos).set({ waState: JSON.stringify({ due: key, count: 2, at: now.getTime() }) }).where(eq(todos.id, t.id));
    }
  }

  // 19:00 · what is still open today, once.
  if (hm >= "19:00" && cfg.eveningDay !== today) {
    const open = [...todayRows, ...overdue];
    if (open.length) { if (await send(`Still open today · ${open.length}\n${list(open)}`)) await saveWaConfig(userId, { ...cfg, eveningDay: today }); }
    else await saveWaConfig(userId, { ...cfg, eveningDay: today });
  }
  return { sent, errors };
}
