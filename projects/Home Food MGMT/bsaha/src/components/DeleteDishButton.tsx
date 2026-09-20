"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteDishForGood } from "@/app/(app)/library/actions";

/** Admin: delete a dish for good, after one confirmation. Lands back on the library. */
export function DeleteDishButton({ id, label, confirmText }: { id: number; label: string; confirmText: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        start(async () => {
          const ok = await deleteDishForGood(id);
          if (ok) router.push("/library");
        });
      }}
      className="text-sm text-accent underline disabled:opacity-50"
    >
      {label}
    </button>
  );
}
