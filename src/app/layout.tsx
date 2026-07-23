import type { Metadata, Viewport } from "next";
import { Inter, Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "SongCraft — песня в подарок",
  description: "Персональные песни в подарок: ваша история, 3 версии трека за несколько минут",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning fixes: Telegram WebApp SDK adds --tg-viewport-height
    // CSS vars to <html> before React hydration → mismatch → broken interactivity
    <html lang="ru" className={cn("h-full", "font-sans", geist.variable)} suppressHydrationWarning>
      <body className={`${inter.className} h-full`} suppressHydrationWarning>
        {children}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
