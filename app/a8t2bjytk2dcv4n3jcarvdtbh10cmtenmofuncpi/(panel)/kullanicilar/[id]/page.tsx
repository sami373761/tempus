import Link from "next/link";
import { notFound } from "next/navigation";

import { adjustScore, banUser, removeAvatar, renameUser, setHiddenFromBoards, unbanUser } from "@/app/actions/admin/users";
import { ActionForm } from "@/components/admin/action-form";
import { DeleteUserForm } from "@/components/admin/forms";
import { Badge, Card, LINK, PageTitle, Table, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/labels";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { publicImageUrl } from "@/lib/storage/images";

export const dynamic = "force-dynamic";

type Detail = {
  user: { id: string; email: string | null; createdAt: string; lastSignInAt: string | null; bannedUntil: string | null; banned: boolean; provider: string; isAdmin: boolean; username: string | null; kp: number | null; avatarKey: string | null; wornBadge: string | null; shownBadge: string | null; hidden: boolean | null; tp: number };
  ledger: { id: number; game: string; kind: string; source: string; tp: number; createdAt: string }[];
  sets: { id: string; game: string; kind: string; answered: number; correct: number; perfects: number; tp: number; createdAt: string }[];
  matches: { id: string; phase: string; isPublic: boolean; seat: number; seat1Score: number; seat2Score: number; createdAt: string }[];
  badges: { slug: string; progress: number; target: number; unlockedAt: string | null }[];
  challenges: { eventId: string; name: string; direction: number; yearAtVote: number; createdAt: string }[];
};

/** §6.7 profile. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = (await adminRpc("admin_user_detail", { p_user_id: id })) as unknown as Detail | null;
  if (!d) notFound();
  const u = d.user;

  return (
    <>
      <PageTitle sub={`${u.email ?? ""} · ${u.provider} · kayıt ${fmtDate(u.createdAt)} · id ${u.id}`}>
        {u.username ?? "(kullanıcı adı yok)"} {u.banned ? <Badge tone="bad">askıda {fmtDate(u.bannedUntil)}</Badge> : null}{" "}
        {u.hidden ? <Badge>panolarda gizli</Badge> : null} {u.isAdmin ? <Badge tone="accent">admin</Badge> : null}
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Özet">
          <div className="flex items-center gap-3">
            {u.avatarKey ? <img src={publicImageUrl(u.avatarKey)} alt="" className="h-14 w-14 rounded-full object-cover" /> : null}
            <ul className="text-sm">
              <li>TP: {u.tp}</li>
              <li>KP: {u.kp ?? "—"}</li>
              <li>Giydiği rozet: {u.wornBadge ?? "—"} (gösterilen: {u.shownBadge ?? "—"})</li>
              <li>Son giriş: {fmtDate(u.lastSignInAt)}</li>
            </ul>
          </div>
        </Card>

        <Card title="Kullanıcı adı">
          <ActionForm
            run={renameUser.bind(null, u.id)}
            fields={[
              { name: "name", label: "Yeni kullanıcı adı", kind: "text", required: true, initial: u.username ?? "" },
              { name: "reserve", label: "Eski adı ayır (başkası alamasın)", kind: "checkbox", initial: true },
            ]}
            submitLabel="Kullanıcı adını değiştir"
          />
        </Card>

        <Card title="Panolar ve avatar">
          <div className="space-y-3">
            <ActionForm
              compact
              run={setHiddenFromBoards.bind(null, u.id)}
              fields={[{ name: "value", label: "Panolardan gizle", kind: "checkbox", initial: Boolean(u.hidden) }]}
              submitLabel="Kaydet"
            />
            {u.avatarKey ? <ActionForm run={removeAvatar.bind(null, u.id)} fields={[]} submitLabel="Avatarı kaldır" danger /> : null}
          </div>
        </Card>

        <Card title="Askıya al">
          {u.banned ? (
            <ActionForm run={unbanUser.bind(null, u.id)} fields={[]} submitLabel="Askıyı kaldır" />
          ) : (
            <ActionForm
              danger
              run={banUser.bind(null, u.id)}
              fields={[
                { name: "hours", label: "Süre (saat)", kind: "number", initial: "24" },
                { name: "note", label: "Not", kind: "textarea" },
              ]}
              submitLabel="Askıya al"
            />
          )}
        </Card>

        <Card title="Puan düzelt">
          <ActionForm
            run={adjustScore.bind(null, u.id)}
            fields={[
              { name: "tp", label: "TP (işaretli, ör. -50)", kind: "number", required: true },
              { name: "note", label: "Not (zorunlu)", kind: "textarea", required: true },
            ]}
            submitLabel="Deftere yaz"
          />
        </Card>

        <Card title="Hesabı sil">
          <DeleteUserForm userId={u.id} confirm={u.username ?? u.email ?? u.id} />
        </Card>

        <Card title="TP defteri (son 100)" className="lg:col-span-3">
          <Table head={["Zaman", "Oyun", "Tür", "Kaynak", "TP"]} empty={d.ledger.length === 0}>
            {d.ledger.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDate(r.createdAt)}</Td>
                <Td>{r.game}</Td>
                <Td>{r.kind}</Td>
                <Td className="text-ink-dim">{r.source}</Td>
                <Td>{r.tp}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Setler" className="lg:col-span-2">
          <Table head={["Zaman", "Oyun", "Cevap", "Doğru", "Kusursuz", "TP"]} empty={d.sets.length === 0}>
            {d.sets.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDate(r.createdAt)}</Td>
                <Td>{r.game}</Td>
                <Td>{r.answered}</Td>
                <Td>{r.correct}</Td>
                <Td>{r.perfects}</Td>
                <Td>{r.tp}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Rozetler">
          <ul className="text-sm">
            {d.badges.map((b) => (
              <li key={b.slug}>
                {b.slug}: {b.progress}/{b.target} {b.unlockedAt ? "✓" : ""}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Versus maçları" className="lg:col-span-2">
          <Table head={["Zaman", "Faz", "Koltuk", "Skor", "Çevrimiçi"]} empty={d.matches.length === 0}>
            {d.matches.map((m) => (
              <tr key={m.id}>
                <Td>{fmtDate(m.createdAt)}</Td>
                <Td>{m.phase}</Td>
                <Td>{m.seat}</Td>
                <Td>
                  {m.seat1Score}–{m.seat2Score}
                </Td>
                <Td>{m.isPublic ? "evet" : "hayır"}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Verdiği itirazlar">
          <ul className="text-sm">
            {d.challenges.map((c, i) => (
              <li key={i}>
                <Link className={LINK} href={adminPath(`itirazlar/${c.eventId}`)}>
                  {c.name}
                </Link>{" "}
                {c.direction > 0 ? "↑" : "↓"} ({c.yearAtVote})
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
