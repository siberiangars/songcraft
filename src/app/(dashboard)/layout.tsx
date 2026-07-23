import { Providers } from "@/app/providers";
import { AppLayout } from "@/components/layout/app-layout";

// CRM providers are here — NOT in root layout
// This keeps SongCraft Mini App completely clean
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppLayout>{children}</AppLayout>
    </Providers>
  );
}
