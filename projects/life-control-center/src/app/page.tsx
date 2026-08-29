import { redirect } from "next/navigation";

/** Root route → Today. */
export default function RootPage() {
  redirect("/today");
}
