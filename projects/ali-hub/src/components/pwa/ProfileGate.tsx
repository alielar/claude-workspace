"use client";

/**
 * A guest whose onboarding is not finished is sent to /welcome from any screen (2026-10-09). Ali's
 * profile says onboarded, so for him this renders nothing and asks nothing more than the one cached
 * profile request every screen already shares.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/profile/useProfile";

export function ProfileGate() {
  const { me } = useProfile();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (me && !me.primary && !me.profile.onboarded && pathname !== "/welcome") router.replace("/welcome");
  }, [me, pathname, router]);
  return null;
}
