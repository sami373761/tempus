import Link from "next/link";

import { Badge, Card, Field, FilterForm, INPUT, LINK, PageTitle, Pager, Table, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/labels";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

type Row = { id: string; username: string | null; email: string | null; provider: string; createdAt: string; tp: number; kp: number | null; lastActive: string | null; banned: boolean; hidden: boolean | null; isAdmin: boolean };
type Sus = {
  highDailyTp: { userId: string; username: string | null; day: string; tp: number; p99: number }[];
  perfectRate: { userId: string; username: string | null; answers: number; perfects: number; rate: number }[];
  fastSets: { userId: string; username: string | null; setId: string; game: string; seconds: number }[];
};

/** §6.7 list and the "şüpheli hareket" tab (`?sekme=supheli`). */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminPage();
  const q = await searchParams;
  const base = adminPath("kullanicilar");
  const user = (id: string, name: string | null) => (
    <Link className={LINK} href={adminPath(`kullanicilar/${id}`)}>
      {name ?? id.slice(0, 8)}
    </Link>
  );
  const tabs = (
    <div className="mb-4 flex gap-4 text-sm">
      <Link className={q.sekme === "supheli" ? LINK : "font-semibold"} href={base}>
        Liste
      </Link>
      <Link className={q.sekme === "supheli" ? "font-semibold" : LINK} href={`${base}?sekme=supheli`}>
        Şüpheli hareket
      </Link>
    </div>
  );

  if (q.sekme === "supheli") {
    const s = (await adminRpc("admin_suspicious_users", {} as Record<PropertyKey, never>)) as unknown as Sus;
    return (
      <>
        <PageTitle sub="Son 7 gün. Bunlar ipucu, hüküm değil.">Kullanıcılar</PageTitle>
        {tabs}
        <div className="space-y-4">
          <Card title="Günlük TP'si en yüksek %1'in 3 katı üstü">
            <Table head={["Kullanıcı", "Gün", "TP", "%99"]} empty={s.highDailyTp.length === 0}>
              {s.highDailyTp.map((r) => (
                <tr key={`${r.userId}${r.day}`}>
                  <Td>{user(r.userId, r.username)}</Td>
                  <Td>{r.day}</Td>
                  <Td>{r.tp}</Td>
                  <Td>{r.p99}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="20+ cevapta Kusursuz oranı > %60">
            <Table head={["Kullanıcı", "Cevap", "Kusursuz", "Oran"]} empty={s.perfectRate.length === 0}>
              {s.perfectRate.map((r) => (
                <tr key={r.userId}>
                  <Td>{user(r.userId, r.username)}</Td>
                  <Td>{r.answers}</Td>
                  <Td>{r.perfects}</Td>
                  <Td>%{Math.round(r.rate * 100)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="10 soruluk seti 30 saniyeden kısa bitiren">
            <Table head={["Kullanıcı", "Oyun", "Süre (sn)"]} empty={s.fastSets.length === 0}>
              {s.fastSets.map((r) => (
                <tr key={r.setId}>
                  <Td>{user(r.userId, r.username)}</Td>
                  <Td>{r.game}</Td>
                  <Td>{r.seconds}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      </>
    );
  }

  const page = Math.max(1, Number(q.sayfa) || 1);
  const data = (await adminRpc("admin_user_list", { p_query: q.ara ?? "", p_page: page })) as unknown as { total: number; rows: Row[] };
  return (
    <>
      <PageTitle>Kullanıcılar</PageTitle>
      {tabs}
      <FilterForm action={base}>
        <Field label="Kullanıcı adı / e-posta / id">
          <input name="ara" defaultValue={q.ara} className={INPUT} />
        </Field>
      </FilterForm>
      <Table head={["Kullanıcı", "E-posta", "Sağlayıcı", "Kayıt", "TP", "KP", "Son aktivite", ""]} empty={data.rows.length === 0}>
        {data.rows.map((r) => (
          <tr key={r.id}>
            <Td>{user(r.id, r.username)}</Td>
            <Td className="text-ink-dim">{r.email}</Td>
            <Td>{r.provider}</Td>
            <Td>{fmtDate(r.createdAt)}</Td>
            <Td>{r.tp}</Td>
            <Td>{r.kp ?? "—"}</Td>
            <Td>{fmtDate(r.lastActive)}</Td>
            <Td>
              {r.banned ? <Badge tone="bad">askıda</Badge> : null} {r.hidden ? <Badge>gizli</Badge> : null} {r.isAdmin ? <Badge tone="accent">admin</Badge> : null}
            </Td>
          </tr>
        ))}
      </Table>
      <Pager base={base} params={{ ara: q.ara }} page={page} total={data.total} />
    </>
  );
}
