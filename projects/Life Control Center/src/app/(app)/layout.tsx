/**
 * Authenticated app layout — all protected routes live inside this group.
 * Single-user app: no auth check, no redirect. Just renders AppShell.
 */

import AppShell from "@/components/layout/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
