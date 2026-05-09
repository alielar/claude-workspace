/**
 * Authenticated app layout.
 * All protected routes live inside this route group.
 * Wraps content in AppShell (sidebar + mobile nav).
 */

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
