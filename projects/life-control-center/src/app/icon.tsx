import { renderFavicon } from "@/lib/appIcon";

// Browser-tab favicon (laptop): bare black glyph, no tile, transparent ground.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return renderFavicon(64);
}
