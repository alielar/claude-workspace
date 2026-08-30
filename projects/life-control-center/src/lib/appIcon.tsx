import { ImageResponse } from "next/og";

/**
 * The app icon, drawn in code so there is no binary asset to keep in sync.
 * Ali's own mark: the A·T·E ligature ("Clean" cut, chosen 2026-08-30) — one glyph
 * holding all three initials. Top bar + centre stem = T; diagonal + shared
 * crossbar = A; stem with three arms = E. White, round caps, on the app's
 * near-black ground.
 */
export function renderAppIcon(size: number) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="#0B0B10"/>` +
    `<g stroke="#FFFFFF" stroke-width="48" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="M112 140 H430"/>` +
    `<path d="M300 140 V404"/>` +
    `<path d="M292 146 L118 404"/>` +
    `<path d="M158 300 H424"/>` +
    `<path d="M300 404 H424"/>` +
    `</g></svg>`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={size} height={size} />
      </div>
    ),
    { width: size, height: size }
  );
}
