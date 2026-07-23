import type { Metadata } from "next";
import { hasAdminSession } from "@/lib/songcraft/admin-auth";
import { AdminDashboard } from "./AdminDashboard";

export const metadata: Metadata = {
  title: "SongCraft Control",
  description: "Панель управления SongCraft",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SongCraftAdminPage() {
  return <AdminDashboard initialAuthenticated={await hasAdminSession()} />;
}
