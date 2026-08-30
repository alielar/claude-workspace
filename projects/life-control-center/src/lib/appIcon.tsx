import { ImageResponse } from "next/og";

/**
 * The app icon, drawn in code so there is no binary asset to keep in sync.
 * "A L I": a bold white A on the dark Quiet Morning ground; its crossbar is a
 * horizon with the violet sun rising behind it — a morning app in one glyph.
 * Geometry is authored at 512 and scaled, so every size is identical.
 */
export function renderAppIcon(size: number) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="#0B0B10"/>` +
    `<defs><clipPath id="a"><path d="M256 130 L150 400 L362 400 Z"/></clipPath></defs>` +
    `<circle cx="256" cy="330" r="70" fill="#8B7CF0" clip-path="url(#a)"/>` +
    `<g stroke="#FFFFFF" stroke-width="50" stroke-linecap="round" stroke-linejoin="round" fill="none">` +
    `<path d="M120 404 L256 106 L392 404"/><path d="M182 330 L330 330"/></g>` +
    `</svg>`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={size} height={size} />
      </div>
    ),
    { width: size, height: size }
  );
}
