/**
 * /login — no longer used. Redirect straight to dashboard.
 * Google OAuth flow has been removed; app is single-user with no login.
 */

import { redirect } from "next/navigation";

export default function LoginPage() {
  redirect("/dashboard");
}
