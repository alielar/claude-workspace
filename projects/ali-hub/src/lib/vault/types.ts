/**
 * Vault · the plaintext shapes (exist only in the browser, after unlock) and the CSV
 * import (Chrome, Safari / iCloud Keychain, Firefox, Bitwarden, 1Password, KeePass —
 * matched by column names, so a differently ordered export still lands).
 *
 * On the server an item is { id, blob, updatedAt, deleted } · nothing else. Even the
 * kind and the name are inside the blob.
 */

export type VaultKind = "login" | "apikey" | "recovery" | "note";
export const VAULT_KINDS: { key: VaultKind; label: string; plural: string }[] = [
  { key: "login",    label: "Login",         plural: "Logins" },
  { key: "apikey",   label: "API key",       plural: "API keys" },
  { key: "recovery", label: "Recovery codes", plural: "Recovery codes" },
  { key: "note",     label: "Secure note",   plural: "Secure notes" },
];

export type VaultItem = {
  id: string;
  kind: VaultKind;
  name: string;            // site / account / service
  username?: string;       // email or username (login) · key name / owner (apikey)
  password?: string;       // login password · the API key itself · the note body for "note"
  url?: string;
  codes?: string[];        // recovery codes (one per line)
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

/** What the server stores and returns. */
export type VaultRecord = { id: string; blob: string; updatedAt: number };
export type VaultMeta = { salt: string; iterations: number; verifier: string };

export function newVaultId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

// ─── CSV import ───────────────────────────────────────────────────────────────

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const COLS: Record<"name" | "url" | "username" | "password" | "notes" | "otp", string[]> = {
  name:     ["name", "title", "account", "site", "website name", "item"],
  url:      ["url", "login_uri", "website", "web site", "login url", "uri", "urls"],
  username: ["username", "login_username", "user name", "email", "login", "user"],
  password: ["password", "login_password", "pass"],
  notes:    ["note", "notes", "comments", "extra"],
  otp:      ["otpauth", "login_totp", "totp", "otp"],
};

export type ImportRow = { name: string; url?: string; username?: string; password?: string; notes?: string };

/** Header-driven mapping · works for Chrome (name,url,username,password,note), Safari/iCloud
 * (Title,URL,Username,Password,Notes,OTPAuth), Firefox, Bitwarden, 1Password and KeePass exports. */
export function csvToImportRows(text: string): { rows: ImportRow[]; skipped: number; unknownHeader: boolean } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], skipped: 0, unknownHeader: table.length === 0 };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = (key: keyof typeof COLS) => header.findIndex((h) => COLS[key].includes(h));
  const iName = idx("name"), iUrl = idx("url"), iUser = idx("username"), iPass = idx("password"), iNotes = idx("notes"), iOtp = idx("otp");
  if (iPass < 0 && iUser < 0) return { rows: [], skipped: table.length - 1, unknownHeader: true };
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const url = get(iUrl);
    let name = get(iName);
    if (!name && url) { try { name = new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { name = url; } }
    const password = get(iPass), username = get(iUser);
    if (!name && !username && !password) { skipped++; continue; }
    const notes = [get(iNotes), get(iOtp) ? `OTP: ${get(iOtp)}` : ""].filter(Boolean).join("\n");
    rows.push({ name: name || username || "Untitled", url: url || undefined, username: username || undefined, password: password || undefined, notes: notes || undefined });
  }
  return { rows, skipped, unknownHeader: false };
}

/** Most-used e-mail addresses across the vault · offered as one-tap defaults. */
export function commonEmails(items: VaultItem[], limit = 4): string[] {
  const count = new Map<string, number>();
  for (const it of items) {
    const u = it.username?.trim().toLowerCase();
    if (u && u.includes("@")) count.set(u, (count.get(u) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([e]) => e);
}
