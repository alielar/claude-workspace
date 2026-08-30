import { renderAppIcon } from "@/lib/appIcon";

// Browser-tab favicon (laptop). Same drawing as the phone icon.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return renderAppIcon(64);
}
