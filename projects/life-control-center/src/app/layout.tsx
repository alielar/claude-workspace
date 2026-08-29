import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SvgDefs } from "@/components/SvgDefs";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Control Center",
  description: "Ali's daily control center.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Control",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06060B" },
    { media: "(prefers-color-scheme: light)", color: "#F4F4F8" },
  ],
};

/**
 * Applies the saved theme before the first paint so there is no flash.
 * Values: "light" | "dark" | (absent = follow the phone's setting).
 */
const THEME_BOOT = `try{var t=localStorage.getItem("cc-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
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
