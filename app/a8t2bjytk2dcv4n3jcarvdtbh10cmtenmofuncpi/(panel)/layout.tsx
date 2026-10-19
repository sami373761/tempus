import { AdminNav } from "@/components/admin/nav";
import { requireAdminPage } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * The panel's gate and chrome. Pages call requireAdminPage() themselves too
 * (a layout and its page render side by side), and every action calls
 * requireAdmin() — this is the first wall, not the only one.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
