import Link from "next/link";

import { EventTable, type EventRow } from "@/components/admin/event-table";
import { Field, FilterForm, INPUT, LINK, PageTitle, Pager, Select, Table, Td } from "@/components/admin/ui";
import { adminCategories, topicOptions } from "@/lib/admin/categories-read";
import { STATUS_LABEL } from "@/lib/admin/labels";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

type Search = Record<string, string | undefined>;
type Raw = Omit<EventRow, "topicLabel" | "href"> & { topic: string | null };
type Dup = { a: { id: string; slug: string; year: number; name: string }; b: { id: string; slug: string; year: number; name: string }; topic: string | null; score: number };

const LOCALES: [string, string][] = [["", "—"], ["tr", "TR"], ["en", "EN"], ["de", "DE"], ["fr", "FR"], ["es", "ES"]];

/** §6.3 list + the duplicates tab (`?sekme=kopya`). */
export default async function EventsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage();
  const q = await searchParams;
  const base = adminPath("olaylar");
  const categories = await adminCategories();
  const titleOf = (slug: string | null) => (slug ? (categories.find((c) => c.slug === slug)?.title ?? slug) : "Tarih");

  const tabs = (
    <div className="mb-4 flex gap-4 text-sm">
      <Link className={q.sekme === "kopya" ? "text-ink" : LINK} href={base}>
        Liste
      </Link>
      <Link className={q.sekme === "kopya" ? LINK.replace("text-accent", "text-ink") : LINK} href={`${base}?sekme=kopya`}>
        Olası kopyalar
      </Link>
    </div>
  );

  if (q.sekme === "kopya") {
    const dups = (await adminRpc("admin_duplicate_candidates", {} as Record<PropertyKey, never>)) as unknown as Dup[];
    return (
      <>
        <PageTitle sub="Aynı konuda, adı benzer ve yıl farkı ≤ 5 olan çiftler.">Olaylar</PageTitle>
        {tabs}
        <Table head={["Olay A", "Olay B", "Konu", "Benzerlik"]} empty={dups.length === 0}>
          {dups.map((d) => (
            <tr key={`${d.a.id}-${d.b.id}`}>
              <Td>
                <Link className={LINK} href={adminPath(`olaylar/${d.a.id}`)}>
                  {d.a.name}
                </Link>{" "}
                <span className="text-ink-dim">({d.a.year})</span>
              </Td>
              <Td>
                <Link className={LINK} href={adminPath(`olaylar/${d.b.id}`)}>
                  {d.b.name}
                </Link>{" "}
                <span className="text-ink-dim">({d.b.year})</span>
              </Td>
              <Td>{titleOf(d.topic)}</Td>
              <Td>{d.score}</Td>
            </tr>
          ))}
        </Table>
      </>
    );
  }

  const page = Math.max(1, Number(q.sayfa) || 1);
  const data = (await adminRpc("admin_event_list", {
    p_filters: {
      q: q.ara ?? "",
      topic: q.konu ?? "",
      status: q.durum ?? "",
      era: q.era ?? "",
      noImage: q.gorsel === "yok",
      missingDescription: q.aciklama ?? "",
      missingTranslation: q.ceviri ?? "",
      sensitive: q.hassas === "1" ? true : q.hassas === "0" ? false : null,
    },
    p_page: page,
  })) as unknown as { total: number; rows: Raw[] };

  const rows: EventRow[] = data.rows.map((r) => ({ ...r, topicLabel: titleOf(r.topic), href: adminPath(`olaylar/${r.id}`) }));

  return (
    <>
      <PageTitle>Olaylar</PageTitle>
      {tabs}
      <FilterForm action={base}>
        <Field label="Ara (5 dilde ad, slug)">
          <input name="ara" defaultValue={q.ara} className={INPUT} />
        </Field>
        <Field label="Konu">
          <Select name="konu" value={q.konu} options={topicOptions(categories)} />
        </Field>
        <Field label="Durum">
          <Select name="durum" value={q.durum} options={[["", "Tümü"], ...Object.entries(STATUS_LABEL)]} />
        </Field>
        <Field label="Era">
          <Select name="era" value={q.era} options={[["", "Tümü"], ["bce", "MÖ"], ["ce", "MS"], ["future", "Gelecek"]]} />
        </Field>
        <Field label="Görsel">
          <Select name="gorsel" value={q.gorsel} options={[["", "Tümü"], ["yok", "Görseli yok"]]} />
        </Field>
        <Field label="Açıklaması eksik">
          <Select name="aciklama" value={q.aciklama} options={LOCALES} />
        </Field>
        <Field label="Çevirisi eksik">
          <Select name="ceviri" value={q.ceviri} options={LOCALES} />
        </Field>
        <Field label="Hassas">
          <Select name="hassas" value={q.hassas} options={[["", "Tümü"], ["1", "Evet"], ["0", "Hayır"]]} />
        </Field>
      </FilterForm>
      <EventTable rows={rows} />
      <Pager base={base} params={{ ...q, sayfa: undefined }} page={page} total={data.total} />
    </>
  );
}
