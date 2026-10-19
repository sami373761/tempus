import type { Metadata } from "next";

/**
 * The admin panel's root (address: lib/admin/path.ts). Turkish only, never
 * indexed, never cached (next.config.ts adds the response headers). No site
 * chrome: the panel is not part of the game, and nothing on the site links
 * here.
 */
export const metadata: Metadata = {
  title: "Yönetim",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="tr" className="min-h-dvh bg-page text-ink">
      {children}
    </div>
  );
}
