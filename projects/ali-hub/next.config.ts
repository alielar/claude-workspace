import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  async redirects() {
    // ALAI became R2-D2 (Ali 2026-10-03) · old bookmarks and pushes still land.
    return [{ source: "/alai", destination: "/r2d2", permanent: true }];
  },
  async headers() {
    return [
      {
        // The service worker must never be cached by the browser or CDN,
        // otherwise a new version can take a day to reach the phone.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
