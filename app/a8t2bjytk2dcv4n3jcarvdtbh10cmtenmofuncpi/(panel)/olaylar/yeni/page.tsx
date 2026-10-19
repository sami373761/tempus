import Link from "next/link";

import { NewEventForm, type NewEventCategory } from "@/components/admin/new-event-form";
import { Card, LINK, PageTitle } from "@/components/admin/ui";
import { adminCategories } from "@/lib/admin/categories-read";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

/** §6.4 single event. Categories with their bounds and tags, one call each. */
export default async function NewEventPage() {
  await requireAdminPage();
  const list = await adminCategories();
  const details = await Promise.all(
    list.map((c) =>
      adminRpc("admin_category_detail", { p_slug: c.slug }) as Promise<unknown>,
    ),
  );
  const categories: NewEventCategory[] = list.map((c, i) => {
    const d = details[i] as {
      category: { layout: "landscape" | "poster" };
      bounds: { min: number; max: number } | null;
      tags: { slug: string; names: Record<string, string> }[];
    } | null;
    return {
      slug: c.slug,
      title: c.title,
      status: c.status,
      layout: d?.category.layout ?? "landscape",
      bounds: d?.bounds ?? null,
      tags: (d?.tags ?? []).map((t) => ({ slug: t.slug, name: t.names.tr ?? t.slug })),
    };
  });
  return (
    <>
      <PageTitle sub={<Link className={LINK} href={adminPath("olaylar/yeni/toplu")}>Toplu içe aktarma →</Link>}>Olay ekle</PageTitle>
      <Card>
        <NewEventForm categories={categories} />
      </Card>
    </>
  );
}
