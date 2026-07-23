import type { Metadata, Viewport } from "next";
import { ClientOnly } from "@/components/songcraft/ClientOnly";
import { BottomNav } from "@/components/songcraft/BottomNav";
import { TelegramInit } from "@/components/songcraft/TelegramInit";
import { MarketingTracker } from "@/components/songcraft/MarketingTracker";
import "./songcraft.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "SongCraft - персональные треки",
  description: "Создай уникальный музыкальный подарок за несколько минут",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#120812",
};

function LoadingSkeleton() {
  return (
    <div style={{ minHeight: "100vh", background: "#120812", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px", color: "#ffd66b" }}>♪</div>
        <div style={{ color: "#b6a5b8", fontSize: "14px" }}>Загрузка...</div>
      </div>
    </div>
  );
}

export default function SongCraftLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html,body{background:#120812!important;color:#fff6ec!important;margin:0;padding:0;min-height:100%}
        :root{--background:rgb(18,8,18)!important;--foreground:rgb(255,246,236)!important}
      `}</style>
      <ClientOnly fallback={<LoadingSkeleton />}>
        <div className="sc-body">
          <TelegramInit />
          <MarketingTracker />
          <main className="sc-content">{children}</main>
          <BottomNav />
        </div>
      </ClientOnly>
    </>
  );
}
