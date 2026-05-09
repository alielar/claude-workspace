import { redirect } from "next/navigation";

/**
 * Root route — redirects to /dashboard.
 * The middleware handles auth; if not logged in it redirects to /login first.
 */
export default function RootPage() {
  redirect("/dashboard");
}
