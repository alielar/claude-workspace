import { redirect } from "next/navigation";

/** The daily shortlist became the weekly plan (2026-09-22). */
export default function PoolPage() {
  redirect("/week");
}
