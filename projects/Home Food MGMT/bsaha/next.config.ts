import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A dish photo arrives inside the add-dish form (resized on the phone first, so well under this).
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
