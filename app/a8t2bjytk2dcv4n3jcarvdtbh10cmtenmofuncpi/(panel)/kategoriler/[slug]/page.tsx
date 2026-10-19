import { notFound } from "next/navigation";

import { deleteCategory, setCategoryHome, setCategoryStatus } from "@/app/actions/admin/categories";
import { ActionForm } from "@/components/admin/action-form";
import { ArtUpload, TagEditor } from "@/components/admin/category-extras";
import { CategoryEditor } from "@/components/admin/category-editor";
import { Badge, Card, PageTitle } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import type { CategoryPane } from "@/lib/game/builtin-categories";
import type { BandSet } from "@/lib/game/scoring";

export const dynamic = "force-dynamic";

type Detail = {
  category: {
    slug: string;
    layout: "landscape" | "poster";
    panes: CategoryPane[];
    defaultPane: string;
    bands: BandSet;
    imagePrefix: string;
    cardImageKey: string | null;
    backdropKey: string | null;
    tagKind: string | null;
    showOnHome: boolean;
    homeOrder: number;
    status: string;
    isBuiltin: boolean;
  };
  titles: { locale: string; title: string; blurb: string | null }[];
  tags: { slug: string; names: Record<string, string>; used: number }[];
  years: number[];
  counts: { events: number; published: number; playable: number };
};

/** §7 category editor: rails, titles, tags, art, status, home, delete. */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdminPage();
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();
  const d = (await adminRpc("admin_category_detail", { p_slug: slug })) as unknown as Detail | null;
  if (!d) notFound();
  const c = d.category;
  const tr = d.titles.find((t) => t.locale === "tr")?.title ?? c.slug;

  return (
    <>
      <PageTitle sub={`${c.slug} · ${d.counts.events} olay, ${d.counts.published} yayında, ${d.counts.playable} oynanabilir`}>
        {tr} {c.isBuiltin ? <Badge>yerleşik</Badge> : null} {c.status === "published" ? <Badge tone="good">yayında</Badge> : <Badge>taslak</Badge>}
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Kategori" className="lg:col-span-2">
          <CategoryEditor
            mode="edit"
            slug={c.slug}
            isBuiltin={c.isBuiltin}
            initial={{
              layout: c.layout,
              panes: c.panes,
              defaultPane: c.defaultPane,
              bands: c.bands,
              imagePrefix: c.imagePrefix,
              tagKind: c.tagKind,
              titles: d.titles,
            }}
            years={d.years}
          />
        </Card>
        <div className="space-y-4">
          <Card title="Yayın">
            <ActionForm
              compact
              run={setCategoryStatus.bind(null, c.slug)}
              fields={[{ name: "status", label: "Durum", kind: "select", initial: c.status, options: [["draft", "Taslak"], ["published", "Yayında"]] }]}
              submitLabel="Uygula"
            />
          </Card>
          <Card title="Ana sayfa">
            <ActionForm
              run={setCategoryHome.bind(null, c.slug)}
              fields={[
                { name: "show", label: "Ana sayfada göster", kind: "checkbox", initial: c.showOnHome },
                { name: "order", label: "Sıra (küçük önce)", kind: "number", initial: String(c.homeOrder) },
              ]}
              submitLabel="Kaydet"
            />
          </Card>
          {!c.isBuiltin ? (
            <>
              <Card title="Kart görseli">
                <ArtUpload slug={c.slug} kind="card" current={c.cardImageKey} />
              </Card>
              <Card title="Arka plan">
                <ArtUpload slug={c.slug} kind="backdrop" current={c.backdropKey} />
              </Card>
            </>
          ) : (
            <Card title="Görseller">
              <p className="text-sm text-ink-dim">Yerleşik kategorinin kart ve arka planı kodda (lib/storage/images.ts).</p>
            </Card>
          )}
        </div>
        {c.tagKind ? (
          <Card title={`Ek etiket: ${c.tagKind}`} className="lg:col-span-3">
            <TagEditor slug={c.slug} initial={d.tags} />
          </Card>
        ) : null}
        {!c.isBuiltin ? (
          <Card title="Kategoriyi sil" className="lg:col-span-3">
            <ActionForm
              danger
              run={deleteCategory.bind(null, c.slug)}
              fields={[]}
              confirmText={c.slug}
              confirmHint="Yalnız içinde olay yoksa silinir. Onay için slug'ı yazın:"
              submitLabel="Kategoriyi sil"
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}
