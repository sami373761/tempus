import Link from "next/link";

import { Field, FilterForm, INPUT, LINK, PageTitle, Pager, Select, Table, Td } from "@/components/admin/ui";
import { adminCategories, topicOptions } from "@/lib/admin/categories-read";
import { fmtDate, topicLabel } from "@/lib/admin/labels";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

type Row = {
  eventId: string;
  slug: string;
  yearLabel: string;
  topic: string | null;
  name: string;
  later: number;
  earlier: number;
  total: number;
  net: number;
  lastVote: string | null;
};

type Search = Record<string, string | undefined>;

/** §6.2 list. Only votes for the event's current year, after its last review. */
export default async function ChallengesPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage();
  const q = await searchParams;
  const page = Math.max(1, Number(q.sayfa) || 1);
  const [list, categories] = await Promise.all([
    adminRpc("admin_challenge_list", {
      p_filters: {
        topic: q.konu ?? "",
        era: q.era ?? "",
        locale: q.dil ?? "",
        from: q.baslangic ?? "",
        to: q.bitis ?? "",
        openOnly: q.hepsi !== "1",
        sort: q.sirala ?? "volume",
      },
      p_page: page,
    }) as Promise<unknown>,
    adminCategories(),
  ]);
  const data = list as { total: number; rows: Row[] };
  const base = adminPath("itirazlar");

  return (
    <>
      <PageTitle sub="Yalnız olayın güncel yılına verilmiş, son incelemeden sonraki oylar sayılır.">Tarih itirazları</PageTitle>
      <FilterForm action={base}>
        <Field label="Konu">
          <Select name="konu" value={q.konu} options={topicOptions(categories)} />
        </Field>
        <Field label="Era">
          <Select name="era" value={q.era} options={[["", "Tümü"], ["bce", "MÖ"], ["ce", "MS"], ["future", "Gelecek"]]} />
        </Field>
        <Field label="Dil">
          <Select name="dil" value={q.dil} options={[["", "Tümü"], ["tr", "TR"], ["en", "EN"], ["de", "DE"], ["fr", "FR"], ["es", "ES"]]} />
        </Field>
        <Field label="Başlangıç">
          <input type="date" name="baslangic" defaultValue={q.baslangic} className={INPUT} />
        </Field>
        <Field label="Bitiş">
          <input type="date" name="bitis" defaultValue={q.bitis} className={INPUT} />
        </Field>
        <Field label="Sırala">
          <Select
            name="sirala"
            value={q.sirala}
            options={[["volume", "Hacim"], ["later", "Daha geç"], ["earlier", "Daha erken"], ["newest", "En yeni"]]}
          />
        </Field>
        <Field label="Kapsam">
          <Select name="hepsi" value={q.hepsi} options={[["", "Yalnız açık"], ["1", "Tüm olaylar"]]} />
        </Field>
      </FilterForm>

      <Table head={["Olay", "Konu", "Yıl", "↑ daha geç", "↓ daha erken", "Toplam", "Net", "Son oy"]} empty={data.rows.length === 0}>
        {data.rows.map((r) => (
          <tr key={r.eventId}>
            <Td>
              <Link className={LINK} href={adminPath(`itirazlar/${r.eventId}`)}>
                {r.name}
              </Link>
            </Td>
            <Td>{topicLabel(r.topic)}</Td>
            <Td>{r.yearLabel}</Td>
            <Td>{r.later}</Td>
            <Td>{r.earlier}</Td>
            <Td>{r.total}</Td>
            <Td>{r.net > 0 ? `+${r.net}` : r.net}</Td>
            <Td>{fmtDate(r.lastVote)}</Td>
          </tr>
        ))}
      </Table>
      <Pager base={base} params={{ ...q, sayfa: undefined }} page={page} total={data.total} />
    </>
  );
}
