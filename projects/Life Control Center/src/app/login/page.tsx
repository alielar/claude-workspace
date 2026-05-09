"use client";

/**
 * Login page — Google OAuth only.
 * Single-user app; no registration needed.
 */

import { signIn } from "next-auth/react";
import { motion } from "framer-motion";

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-base)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="glass w-full max-w-sm p-10 flex flex-col items-center gap-8"
      >
        {/* Logo */}
        <div className="text-center space-y-2">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold mx-auto glow-accent"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            CC
          </div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Life Control Center
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Your personal command center
          </p>
        </div>

        {/* Sign in button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full flex items-center justify-center gap-3 py-3 px-6 rounded-xl font-medium text-sm transition-all"
          style={{
            background: "var(--accent)",
            color: "#fff",
            boxShadow: "0 0 24px var(--accent-glow)",
          }}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#fff" fillOpacity=".9"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#fff" fillOpacity=".9"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" fillOpacity=".9"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".9"/>
          </svg>
          Continue with Google
        </motion.button>

        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Personal use only
        </p>
      </motion.div>
    </div>
  );
}
