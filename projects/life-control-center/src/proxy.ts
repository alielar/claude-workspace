/**
 * Proxy (Next.js 16 middleware) — passthrough.
 * Single-user app, no auth gating needed.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function proxy(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
