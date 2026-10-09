"use client";

import { useMemo } from "react";
import { navFor, type NavSet } from "@/lib/navigation";
import { useProfile } from "@/lib/profile/useProfile";

/** The navigation this account sees (Ali: everything · a guest: no Train, Health, R2-D2). Memoised so effects keyed on it stay quiet. */
export function useNav(): NavSet {
  const { profile } = useProfile();
  const key = profile ? profile.sections.join(",") : null;
  return useMemo(() => navFor(key === null ? null : key.split(",").filter(Boolean)), [key]);
}
