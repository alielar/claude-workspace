/** Call /api/admin/migrate at most once per browser session. */
let ran = false;

export function ensureMigrate() {
  if (ran) return;
  ran = true;
  fetch("/api/admin/migrate", { method: "POST" }).catch(() => {});
}
