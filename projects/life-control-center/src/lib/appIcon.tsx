import { ImageResponse } from "next/og";

/**
 * The app icon, drawn in code so there is no binary asset to keep in sync.
 * "Helm": a flat violet tile (the Quiet Morning accent) with a white ship's wheel.
 * No gradients, no letter — reads at 60px under the home-screen label "Helm".
 */
export function renderAppIcon(size: number) {
  const c = size / 2;
  const rOuter = size * 0.30;    // rim
  const rim = size * 0.055;      // rim thickness
  const rHub = size * 0.075;     // centre hub
  const handle = size * 0.075;   // how far the 8 handles stick out past the rim
  const spoke = size * 0.045;    // spoke thickness
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x2 = c + Math.cos(a) * (rOuter + handle);
    const y2 = c + Math.sin(a) * (rOuter + handle);
    return `<line x1="${c}" y1="${c}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />`;
  }).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#6A5AE0"/>` +
    `<g stroke="#FFFFFF" stroke-width="${spoke}" stroke-linecap="round">${spokes}</g>` +
    `<circle cx="${c}" cy="${c}" r="${rOuter}" fill="none" stroke="#FFFFFF" stroke-width="${rim}"/>` +
    `<circle cx="${c}" cy="${c}" r="${rHub}" fill="#FFFFFF"/>` +
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
