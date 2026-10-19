import { CategoryEditor } from "@/components/admin/category-editor";
import { Card, PageTitle } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/** §7.9 "Yeni kategori (taslak)". Yalnız tarih tahmini modu. */
export default async function NewCategoryPage() {
  await requireAdminPage();
  return (
    <>
      <PageTitle sub="Taslak olarak açılır. Yayınlamak için ≥ 10 görselli yayında olay, 5 dilde başlık, kart görseli ve arka plan gerekir.">Yeni kategori</PageTitle>
      <Card>
        <CategoryEditor mode="create" />
      </Card>
    </>
  );
}
