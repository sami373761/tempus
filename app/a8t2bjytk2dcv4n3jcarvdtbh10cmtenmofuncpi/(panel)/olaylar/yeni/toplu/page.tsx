import { BulkImport } from "@/components/admin/bulk-import";
import { Card, PageTitle } from "@/components/admin/ui";
import { adminCategories } from "@/lib/admin/categories-read";
import { requireAdminPage } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/** §6.4 bulk import. Images are added afterwards from the images page. */
export default async function BulkImportPage() {
  await requireAdminPage();
  const categories = await adminCategories();
  return (
    <>
      <PageTitle sub="JSON: konu oyunlarında data/<konu>.json biçimi; yeni kategoriler ve Tarih için [{ id, year, names, description, tag? }]. Olaylar görselsiz eklenir.">
        Toplu içe aktarma
      </PageTitle>
      <Card>
        <BulkImport topics={[...categories.map((c) => [c.slug, c.title] as [string, string]), ["history", "Tarih"]]} />
      </Card>
    </>
  );
}
