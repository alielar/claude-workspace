import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bsaha",
    short_name: "Bsaha",
    description: "What are we eating tomorrow?",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    dir: "auto",
    categories: ["food"],
    prefer_related_applications: false,
    background_color: "#fbf5ec",
    theme_color: "#fbf5ec",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
