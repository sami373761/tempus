import Link from "next/link";

import { moveImageToEraFolder } from "@/app/actions/admin/images";
import { ActionForm } from "@/components/admin/action-form";
import { OrphanTable } from "@/components/admin/orphan-table";
import { Field, FilterForm, LINK, PageTitle, Pager, Select, Table, Td } from "@/components/admin/ui";
import { adminCategories, topicOptions } from "@/lib/admin/categories-read";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

const TABS: [string, string, string][] = [
  ["gorselsiz", "missing", "Görselsiz olaylar"],
  ["lisans", "license", "Lisans denetimi"],
  ["klasor", "folder", "Klasör uyumsuzluğu"],
  ["kucultulmemis", "unshrunk", "Küçültülmemiş"],
  ["oksuz", "orphans", "Öksüz satırlar"],
];

type Row = {
  eventId: string;
  slug: string;
  topic: string | null;
  era: string;
  name: string;
  imageId: string | null;
  key: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
  status: string | null;
};

/** §6.5. Uploading happens on each event's editor page. */
export default async function ImagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const q = await searchParams;
  const tab = TABS.find(([s]) => s === q.sekme) ?? TABS[0]!;
  const page = Math.max(1, Number(q.sayfa) || 1);
  const [raw, categories] = await Promise.all([
    adminRpc("admin_image_report", { p_tab: tab[1], p_topic: q.konu ?? "", p_page: page }) as Promise<unknown>,
    adminCategories(),
  ]);
  const data = raw as { total: number; rows: Row[] };
  const base = adminPath("gorseller");
  const prefix = (topic: string | null, era: string) => (topic ? (categories.find((c) => c.slug === topic)?.imagePrefix ?? topic) : era);

  return (
    <>
      <PageTitle>Görseller</PageTitle>
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        {TABS.map(([s, , label]) => (
          <Link key={s} href={`${base}?sekme=${s}`} className={s === tab[0] ? "font-semibold text-ink" : LINK}>
            {label}
          </Link>
        ))}
      </div>
      <FilterForm action={base}>
        <input type="hidden" name="sekme" value={tab[0]} />
        <Field label="Konu">
          <Select name="konu" value={q.konu} options={topicOptions(categories)} />
        </Field>
      </FilterForm>

      {tab[1] === "orphans" ? (
        <OrphanTable rows={data.rows.map((r) => ({ imageId: r.imageId!, key: r.key!, slug: r.slug }))} />
      ) : (
        <Table
          head={
            tab[1] === "missing"
              ? ["Olay", "Beklenen anahtar", ""]
              : tab[1] === "license"
                ? ["Olay", "Anahtar", "Lisans", "Sorun"]
                : tab[1] === "folder"
                  ? ["Olay", "Anahtar", "Era", ""]
                  : ["Olay", "Anahtar", "Boyut"]
          }
          empty={data.rows.length === 0}
        >
          {data.rows.map((r) => (
            <tr key={`${r.eventId}-${r.imageId ?? ""}`}>
              <Td>
                <Link className={LINK} href={adminPath(`olaylar/${r.eventId}`)}>
                  {r.name}
                </Link>
              </Td>
              {tab[1] === "missing" ? (
                <>
                  <Td className="text-ink-dim">{`${prefix(r.topic, r.era)}/${r.slug}.<uzantı>`}</Td>
                  <Td>
                    <Link className={LINK} href={adminPath(`olaylar/${r.eventId}`)}>
                      Görsel yükle
                    </Link>
                  </Td>
                </>
              ) : tab[1] === "license" ? (
                <>
                  <Td>{r.key}</Td>
                  <Td>{r.license}</Td>
                  <Td className="text-bad">{r.status === "non-commercial" ? "Ticari kullanım yok (NC)" : "Yazar/atıf eksik"}</Td>
                </>
              ) : tab[1] === "folder" ? (
                <>
                  <Td>{r.key}</Td>
                  <Td>{r.era}</Td>
                  <Td>
                    <ActionForm run={moveImageToEraFolder.bind(null, r.eventId)} fields={[]} submitLabel="Klasöre taşı" />
                  </Td>
                </>
              ) : (
                <>
                  <Td>{r.key}</Td>
                  <Td>
                    {r.width}×{r.height}
                  </Td>
                </>
              )}
            </tr>
          ))}
        </Table>
      )}
      <Pager base={base} params={{ sekme: tab[0], konu: q.konu }} page={page} total={data.total} />
      <p className="mt-4 text-xs text-ink-dim">
        Panelden yüklenen her görsel master + WebP (uzun kenar ≤ 1600) olarak birlikte yazılır; “shrink en son” kuralı kendiliğinden sağlanır.
      </p>
    </>
  );
}
