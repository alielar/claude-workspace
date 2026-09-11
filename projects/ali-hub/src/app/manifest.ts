import type { MetadataRoute } from "next";

/**
 * Web app manifest · makes the app installable on the iPhone home screen.
 * Icons are generated at build time by /icon-192.png and /icon-512.png routes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A L I",
    short_name: "A L I",
    description: "Ali's day · routine, training, to-do, news",
    id: "/today",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B10",
    theme_color: "#0B0B10",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
