import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
