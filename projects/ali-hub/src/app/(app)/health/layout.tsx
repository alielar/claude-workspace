import { SectionGuard } from "@/components/layout/SectionGuard";

/** Ali's section (2026-10-09): a guest typing the address sees one card, not the page. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SectionGuard section="health">{children}</SectionGuard>;
}
