import Link from "next/link";

import { Field, FilterForm, INPUT, LINK, PageTitle, Pager, Select, Table, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/labels";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

type Row = { id: number; actorId: string; action: string; targetTable: string; targetId: string; note: string | null; createdAt: string };

/** §6.11 list. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const q = await searchParams;
  const page = Math.max(1, Number(q.sayfa) || 1);
  const data = (await adminRpc("admin_audit_list", {
    p_filters: { action: q.eylem ?? "", table: q.tablo ?? "", target: q.hedef ?? "", from: q.baslangic ?? "", to: q.bitis ?? "" },
    p_page: page,
  })) as unknown as { total: number; actions: string[]; rows: Row[] };
  const base = adminPath("kayit");
  return (
    <>
      <PageTitle>İşlem kaydı</PageTitle>
      <FilterForm action={base}>
        <Field label="Eylem">
          <Select name="eylem" value={q.eylem} options={[["", "Tümü"], ...data.actions.map((a) => [a, a] as [string, string])]} />
        </Field>
        <Field label="Tablo">
          <input name="tablo" defaultValue={q.tablo} className={INPUT} />
        </Field>
        <Field label="Hedef id">
          <input name="hedef" defaultValue={q.hedef} className={INPUT} />
        </Field>
        <Field label="Başlangıç">
          <input type="date" name="baslangic" defaultValue={q.baslangic} className={INPUT} />
        </Field>
        <Field label="Bitiş">
          <input type="date" name="bitis" defaultValue={q.bitis} className={INPUT} />
        </Field>
      </FilterForm>
      <Table head={["#", "Zaman", "Eylem", "Hedef", "Not"]} empty={data.rows.length === 0}>
        {data.rows.map((r) => (
          <tr key={r.id}>
            <Td>
              <Link className={LINK} href={adminPath(`kayit/${r.id}`)}>
                {r.id}
              </Link>
            </Td>
            <Td>{fmtDate(r.createdAt)}</Td>
            <Td>{r.action}</Td>
            <Td className="text-ink-dim">
              {r.targetTable}/{r.targetId.slice(0, 36)}
            </Td>
            <Td>{r.note}</Td>
          </tr>
        ))}
      </Table>
      <Pager base={base} params={{ ...q, sayfa: undefined }} page={page} total={data.total} />
    </>
  );
}
