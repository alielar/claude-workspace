"use client";

/** Turn reminders on/off for this device (browser push). */

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone) || matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export async function enablePush(): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  const reg = await navigator.serviceWorker.ready;
  const info = await fetch("/api/push").then((r) => r.json()) as { publicKey: string | null };
  if (!info.publicKey) throw new Error("Server has no push key");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(info.publicKey) });
  await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  try { localStorage.setItem("cc-push-on", "1"); } catch { /* ignore */ }
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  }
  try { localStorage.removeItem("cc-push-on"); } catch { /* ignore */ }
  return "off";
}

/**
 * Health check for devices that once turned reminders on (cc-push-on).
 * iOS drops web-push subscriptions (updates, storage pressure), and the server
 * deletes a subscription the moment the push service returns 410 · both used to
 * happen silently. Called on app open:
 *  "ok"     · permission granted, this device's subscription is on the server;
 *  "healed" · the subscription was missing or unknown to the server, but
 *             permission is still granted, so it was quietly re-created;
 *  "broken" · permission was revoked (or re-subscribing failed) · needs Ali,
 *             show it in-app;
 *  "na"     · reminders were never turned on here / no push support.
 */
export async function checkPushHealth(): Promise<"ok" | "healed" | "broken" | "na"> {
  try {
    if (localStorage.getItem("cc-push-on") !== "1") return "na";
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "na";
    if (Notification.permission !== "granted") return "broken";
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    const info = await fetch("/api/push").then((r) => r.json()) as { publicKey: string | null; endpoints?: string[] };
    if (!info.publicKey) return "na";
    if (sub && info.endpoints?.includes(sub.endpoint)) return "ok";
    // Permission is still granted · re-subscribe (allowed without a tap) and re-register.
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(info.publicKey) });
    const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    return r.ok ? "healed" : "broken";
  } catch {
    return "broken";
  }
}
