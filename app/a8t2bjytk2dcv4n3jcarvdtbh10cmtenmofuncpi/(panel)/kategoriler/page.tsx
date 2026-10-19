import Link from "next/link";

import { Badge, LINK, PageTitle, Table, Td } from "@/components/admin/ui";
import { adminCategories } from "@/lib/admin/categories-read";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/** §7: every game category. */
export default async function CategoriesPage() {
  await requireAdminPage();
  const categories = await adminCategories();
  return (
    <>
      <PageTitle sub={<Link className={LINK} href={adminPath("kategoriler/yeni")}>Yeni kategori →</Link>}>Kategoriler</PageTitle>
      <Table head={["Kategori", "Durum", "Görünüm", "Klasör", "Olay", "Oynanabilir", "Ana sayfa"]} empty={categories.length === 0}>
        {categories.map((c) => (
          <tr key={c.slug}>
            <Td>
              <Link className={LINK} href={adminPath(`kategoriler/${c.slug}`)}>
                {c.title}
              </Link>{" "}
              {c.isBuiltin ? <Badge>yerleşik</Badge> : null}
            </Td>
            <Td>{c.status === "published" ? <Badge tone="good">yayında</Badge> : <Badge>taslak</Badge>}</Td>
            <Td>{c.layout === "poster" ? "Poster" : "Yatay"}</Td>
            <Td>{c.imagePrefix}/</Td>
            <Td>{c.events}</Td>
            <Td>{c.playable}</Td>
            <Td>{c.showOnHome ? `evet (${c.homeOrder})` : "hayır"}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
