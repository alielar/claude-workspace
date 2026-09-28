"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buildMine } from "@/app/(app)/mine/actions";

/** Fills my own menu by the health rules and shows how many dishes came in. */
export function BuildMineButton({ label, done }: { label: string; done: string }) {
  const [added, setAdded] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button disabled={pending} onClick={() => start(async () => {
      const r = await buildMine();
      if (r) { setAdded(r.added.breakfast + r.added.lunch + r.added.dinner); router.refresh(); }
    })} className="btn-soft w-full">
      {added != null ? `${added} ${done}` : label}
    </button>
  );
}
