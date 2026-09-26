"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export type PhotoLabels = { add: string; change: string; remove: string; hint: string; bad: string };

const FULL = 1200, THUMB = 480;

/** Draw the picture at most `max` pixels wide or tall and return it as a JPEG data URL. */
function shrink(img: HTMLImageElement | ImageBitmap, max: number, quality: number) {
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

function load(file: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error("not an image")); };
    img.src = url;
  });
}

/**
 * The photo of a new dish. Three ways in, all ending as the same two hidden fields:
 * pick a file (the phone offers the gallery and camera, the laptop its files), paste a copied
 * photo (a photo copied on the phone and pasted on the Mac lands here too), or drop one on it.
 * The picture is shrunk here before it is sent, so uploads stay small even from a 12MP camera.
 */
export function PhotoField({ labels }: { labels: PhotoLabels }) {
  const [full, setFull] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function take(file: Blob | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setBusy(true); setError(null);
    try {
      const img = await load(file);
      setFull(shrink(img, FULL, 0.82));
      setThumb(shrink(img, THUMB, 0.75));
    } catch {
      setError(labels.bad);
    } finally {
      setBusy(false);
    }
  }

  // A paste anywhere on the page while this form is open counts, so no field needs focusing first.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      void take(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-2">
      <input type="hidden" name="photo_full" value={full ?? ""} />
      <input type="hidden" name="photo_thumb" value={thumb ?? ""} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ""; }} />

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]); }}
        className={clsx("tile relative aspect-[4/3] overflow-hidden flex items-center justify-center text-center cursor-pointer",
          over && "border-accent", !full && "border-dashed")}
      >
        {full ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={full} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="px-6">
            <p className="text-lg font-bold text-accent">{busy ? "…" : labels.add}</p>
            <p className="mt-1 text-sm text-muted">{labels.hint}</p>
          </div>
        )}
      </div>

      {full && (
        <div className="flex gap-2">
          <button type="button" className="btn-soft flex-1" onClick={() => fileRef.current?.click()}>{labels.change}</button>
          <button type="button" className="btn-ghost flex-1" onClick={() => { setFull(null); setThumb(null); }}>{labels.remove}</button>
        </div>
      )}
      {error && <p className="text-sm font-semibold text-accent">{error}</p>}
    </div>
  );
}
