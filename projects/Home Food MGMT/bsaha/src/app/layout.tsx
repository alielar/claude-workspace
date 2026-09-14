import type { Metadata, Viewport } from "next";
import { Nunito, Noto_Sans_Arabic } from "next/font/google";
import { currentPerson } from "@/lib/session";
import { isRtl } from "@/lib/i18n/dict";
import "./globals.css";

const latin = Nunito({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });

export const metadata: Metadata = {
  title: "Bsaha",
  description: "What are we eating tomorrow?",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bsaha" },
};

export const viewport: Viewport = {
  themeColor: "#fbf5ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentPerson().catch(() => null);
  const lang = me?.lang ?? "en";
  return (
    <html lang={lang} dir={isRtl(lang) ? "rtl" : "ltr"} className={`${latin.variable} ${arabic.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
