"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function NewSessionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");

  useEffect(() => {
    if (!planId) {
      router.replace("/workouts");
      return;
    }

    fetch("/api/workouts/session/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: parseInt(planId) }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.sessionId) {
          router.replace(`/workouts/session/${data.sessionId}/active`);
        } else {
          router.replace("/workouts");
        }
      })
      .catch(() => router.replace("/workouts"));
  }, [planId, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <div style={{ color: "var(--ink-4)", fontSize: 13, fontFamily: "var(--f-mono)" }}>
        Starting session…
      </div>
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense>
      <NewSessionInner />
    </Suspense>
  );
}
