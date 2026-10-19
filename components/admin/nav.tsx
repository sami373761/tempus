import Link from "next/link";

import { adminSignOut } from "@/app/actions/admin-auth";
import { adminPath } from "@/lib/admin/path";

const ITEMS: [string, string][] = [
  ["", "Pano"],
  ["itirazlar", "İtirazlar"],
  ["olaylar", "Olaylar"],
  ["olaylar/yeni", "İçerik ekle"],
  ["gorseller", "Görseller"],
  ["kategoriler", "Kategoriler"],
  ["kullanicilar", "Kullanıcılar"],
  ["versus", "Versus"],
  ["gunluk", "Günlük"],
  ["saglik", "Sağlık"],
  ["kayit", "İşlem kaydı"],
];

export function AdminNav() {
  return (
    <nav className="border-b border-hairline bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <span className="font-semibold">TEMPUS Yönetim</span>
        {ITEMS.map(([href, label]) => (
          <Link key={href} href={adminPath(href)} className="text-ink-dim hover:text-ink">
            {label}
          </Link>
        ))}
        <form action={adminSignOut} className="ml-auto">
          <button className="text-ink-dim hover:text-bad" type="submit">
            Çıkış
          </button>
        </form>
      </div>
    </nav>
  );
}
