"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export type Tab = { href: string; label: string };

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/**
 * Two shapes of the same navigation. On a phone it is the bottom bar; from `lg` up it
 * becomes a column down the left, because a bar pinned to the bottom of a laptop screen
 * is a long way from the content.
 */
export function TabBar({ tabs, appName }: { tabs: Tab[]; appName: string }) {
  const path = usePathname();
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 bg-card border-t border-line safe-bottom lg:hidden">
        <ul className="max-w-md mx-auto flex">
          {tabs.map((tab) => {
            const active = isActive(path, tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link href={tab.href}
                  className={clsx("flex flex-col items-center justify-center h-16 text-base font-bold",
                    active ? "text-accent" : "text-muted")}>
                  <span className={clsx("w-10 h-1.5 rounded-full mb-2", active ? "bg-accent" : "bg-transparent")} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className="hidden lg:flex fixed inset-y-0 start-0 w-60 flex-col border-e border-line bg-card px-4 py-8">
        <div className="px-3 text-xl font-extrabold text-accent">{appName}</div>
        <ul className="mt-8 grid gap-1">
          {tabs.map((tab) => {
            const active = isActive(path, tab.href);
            return (
              <li key={tab.href}>
                <Link href={tab.href}
                  className={clsx("block rounded-xl px-4 py-3 text-base font-bold transition-colors",
                    active ? "bg-accent-soft text-accent" : "text-muted hover:bg-bg")}>
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
