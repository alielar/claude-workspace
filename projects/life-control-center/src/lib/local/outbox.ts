/**
 * Outbox — writes that must reach the server eventually.
 *
 * When the phone is offline (or the server is unreachable) a write is stored
 * here and replayed later, in order. Entries carry a `dedupeKey`: a newer entry
 * with the same key replaces the older one, so tapping a checkbox on and off
 * five times offline sends one final state, not five toggles.
 *
 * Every endpoint used through the outbox MUST be idempotent (send the desired
 * final state, never "toggle").
 */

const KEY = "cc:v1:outbox";

export type OutboxEntry = {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  dedupeKey?: string;
  createdAt: number;
};

function load(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function save(entries: OutboxEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch { /* ignore */ }
}

export function outboxSize(): number {
  return load().length;
}

function enqueue(entry: Omit<OutboxEntry, "id" | "createdAt">) {
  const entries = load().filter((e) => !entry.dedupeKey || e.dedupeKey !== entry.dedupeKey);
  entries.push({ ...entry, id: Math.random().toString(36).slice(2), createdAt: Date.now() });
  save(entries);
}

async function send(entry: Omit<OutboxEntry, "id" | "createdAt">): Promise<Response> {
  return fetch(entry.url, {
    method: entry.method,
    headers: { "Content-Type": "application/json" },
    body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
  });
}

/**
 * Try to send now; if the network is down, queue it.
 * Resolves true if the server accepted it now, false if it was queued.
 * Throws only if the server answered with an error (a real rejection, not a network problem).
 */
export async function sendOrQueue(entry: Omit<OutboxEntry, "id" | "createdAt">): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue(entry);
    return false;
  }
  try {
    const res = await send(entry);
    if (res.status >= 500) { enqueue(entry); return false; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    if (err instanceof TypeError) { enqueue(entry); return false; } // network failure
    throw err;
  }
}

let flushing = false;

/** Replay everything queued, oldest first. Stops at the first network failure. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const entries = load();
  if (entries.length === 0) return;
  flushing = true;
  try {
    for (const entry of entries) {
      try {
        const res = await send(entry);
        if (res.status >= 500) break; // server down — try again later
        // 2xx or 4xx: either accepted or permanently rejected; drop it either way
        save(load().filter((e) => e.id !== entry.id));
      } catch {
        break; // network failure — try again later
      }
    }
  } finally {
    flushing = false;
    window.dispatchEvent(new CustomEvent("cc:outbox-flushed"));
  }
}
