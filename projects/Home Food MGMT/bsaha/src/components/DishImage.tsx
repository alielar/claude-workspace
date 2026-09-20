"use client";

import { useState } from "react";
import { thumb } from "@/lib/dishMeta";

/**
 * Grid and list images come from public/dishes/thumb/ so a long list stays light.
 * If a thumbnail is ever missing, fall back to the full photo instead of showing an
 * empty tile - the symptom used to be a blank card that only filled in once you
 * opened the dish. `eager` is for the handful of images above the fold.
 */
export function DishImage({
  photo, alt = "", eager, className = "absolute inset-0 w-full h-full object-cover",
}: {
  photo: string | null;
  alt?: string;
  eager?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState(() => thumb(photo) ?? photo);
  if (!photo || !src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => { if (src !== photo) setSrc(photo); }}
    />
  );
}
