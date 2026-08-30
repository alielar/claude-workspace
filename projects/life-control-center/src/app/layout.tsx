import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SvgDefs } from "@/components/SvgDefs";

export const metadata: Metadata = {
  title: "A L I",
  description: "Ali's day — routine, training, to-do, news.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "A L I",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0B10" },
    { media: "(prefers-color-scheme: light)", color: "#F3F4F7" },
  ],
};

/**
 * Applies the saved theme before the first paint so there is no flash.
 * Values: "light" | "dark" | (absent = follow the phone's setting).
 */
const THEME_BOOT = `try{var t=localStorage.getItem("cc-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {/* Shared SVG gradient defs — referenced by id in the archived pages */}
        <SvgDefs />
        {children}
      </body>
    </html>
  );
}
