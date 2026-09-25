"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Back" that really goes back. When the previous screen was one of ours (the library, the
 * week planner, the menu), the browser history is used so that screen returns as it was,
 * scroll position included. Opened from a shared link or a fresh tab, it goes to `fallback`.
 */
export function BackLink({ fallback, children, className }: { fallback: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      className={className}
      onClick={(e) => {
        if (typeof window === "undefined") return;
        const cameFromUs = document.referrer.startsWith(window.location.origin) && window.history.length > 1;
        if (!cameFromUs) return;
        e.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
