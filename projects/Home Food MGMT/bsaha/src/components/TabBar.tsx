"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export type Tab = { href: string; label: string };

export function TabBar({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 bg-card border-t border-line safe-bottom">
      <ul className="max-w-md mx-auto flex">
        {tabs.map((tab) => {
          const active = path === tab.href || path.startsWith(tab.href + "/");
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={clsx(
                  "flex flex-col items-center justify-center h-16 text-base font-bold",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <span
                  className={clsx(
                    "w-10 h-1.5 rounded-full mb-2",
                    active ? "bg-accent" : "bg-transparent",
                  )}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
