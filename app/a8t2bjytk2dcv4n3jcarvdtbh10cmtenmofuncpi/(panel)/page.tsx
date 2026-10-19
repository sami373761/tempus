import Link from "next/link";

import { Card, LINK, PageTitle, Stat, Table, Td } from "@/components/admin/ui";
import { adminPath } from "@/lib/admin/path";
import { LOCALE_LABEL, STATUS_LABEL, topicLabel } from "@/lib/admin/labels";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

type Dashboard = {
  openChallenges: number;
  challengesLast24h: number;
  topChallenged: { eventId: string; name: string; total: number; later: number; earlier: number }[];
  eventsByTopicStatus: { topic: string; status: string; n: number }[];
  hiddenByTopic: { topic: string; n: number }[];
  missingDescriptions: { locale: string; n: number }[];
  today: { signups: number; setsStarted: number; matches: number; stuckMatches: number };
  healthWarnings: number;
};

/** §6.1 — one round trip (admin_dashboard). */
export default async function DashboardPage() {
  await requireAdminPage();
  const d = (await adminRpc("admin_dashboard", {} as Record<PropertyKey, never>)) as unknown as Dashboard;
  const topics = [...new Set(d.eventsByTopicStatus.map((r) => r.topic))];
  const statuses = ["draft", "review", "published", "archived"];

  return (
    <>
      <PageTitle>Pano</PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Açık itiraz (olay)" value={d.openChallenges} />
        <Stat label="Son 24 saatte itiraz" value={d.challengesLast24h} />
        <Stat label="Sağlık uyarısı" value={d.healthWarnings} alert={d.healthWarnings > 0} />
        <Stat label="Takılı maç" value={d.today.stuckMatches} alert={d.today.stuckMatches > 0} />
        <Stat label="Bugün yeni kayıt" value={d.today.signups} />
        <Stat label="Bugün başlanan set" value={d.today.setsStarted} />
        <Stat label="Bugün versus maçı" value={d.today.matches} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="En çok itiraz alan 5 olay">
          <Table head={["Olay", "↑ geç", "↓ erken", "Toplam"]} empty={d.topChallenged.length === 0}>
            {d.topChallenged.map((r) => (
              <tr key={r.eventId}>
                <Td>
                  <Link className={LINK} href={adminPath(`itirazlar/${r.eventId}`)}>
                    {r.name}
                  </Link>
                </Td>
                <Td>{r.later}</Td>
                <Td>{r.earlier}</Td>
                <Td>{r.total}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Konu × durum">
          <Table head={["Konu", ...statuses.map((s) => STATUS_LABEL[s] ?? s), "Görselsiz (gizli)"]}>
            {topics.map((topic) => (
              <tr key={topic}>
                <Td>{topicLabel(topic)}</Td>
                {statuses.map((s) => (
                  <Td key={s}>{d.eventsByTopicStatus.find((r) => r.topic === topic && r.status === s)?.n ?? 0}</Td>
                ))}
                <Td>{d.hiddenByTopic.find((r) => r.topic === topic)?.n ?? 0}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Açıklaması eksik çeviri">
          <Table head={["Dil", "Eksik"]}>
            {d.missingDescriptions.map((r) => (
              <tr key={r.locale}>
                <Td>{LOCALE_LABEL[r.locale] ?? r.locale}</Td>
                <Td>
                  <Link className={LINK} href={adminPath(`olaylar?aciklama=${r.locale}`)}>
                    {r.n}
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
