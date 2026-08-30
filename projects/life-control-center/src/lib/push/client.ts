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
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}
