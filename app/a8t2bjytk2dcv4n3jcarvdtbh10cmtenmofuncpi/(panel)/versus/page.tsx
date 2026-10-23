import { abandonMatch, runVersusSweep } from "@/app/actions/admin/versus";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, Card, PageTitle, Stat, Table, Td } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/labels";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

type OpenMatch = {
  id: string;
  phase: string;
  currentIdx: number;
  totalRounds: number;
  isPublic: boolean;
  hasBot: boolean;
  opponentJoined: boolean;
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Open matches in three groups (see 20261023120000_admin_versus_live.sql):
 * `live` is being played, `waiting` is a lobby opened in the last 30 minutes,
 * `stale` is everything else not yet ended — the ones to close by hand.
 */
type Overview = {
  live: OpenMatch[];
  waiting: OpenMatch[];
  stale: OpenMatch[];
  stuck: number;
  ended: number;
  sweepable: number;
  bots: { level: number; finished: number; wins: number; winRate: number | null; avgError: number | null }[];
  kpHistogram: { bucket: number; n: number }[];
  abandonRate: number | null;
  avgMatchWaitSeconds: number | null;
};

/** §6.8. */
export default async function VersusPage() {
  await requireAdminPage();
  const o = (await adminRpc("admin_versus_overview", {} as Record<PropertyKey, never>)) as unknown as Overview;
  const maxKp = Math.max(1, ...o.kpHistogram.map((b) => b.n));
  return (
    <>
      <PageTitle>Versus</PageTitle>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Oynanan maç" value={o.live.length} />
        <Stat label="Bekleyen oda" value={o.waiting.length} />
        <Stat label="Terk edilmiş" value={o.stuck} alert={o.stuck > 0} />
        <Stat label="Bitmiş (tablo)" value={o.ended} />
        <Stat label="Terk oranı (7 gün)" value={o.abandonRate === null ? "—" : `%${Math.round(o.abandonRate * 100)}`} />
        <Stat label="Ort. eşleşme bekleme" value={o.avgMatchWaitSeconds === null ? "—" : `${o.avgMatchWaitSeconds} sn`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bitmiş maçları temizle">
          <p className="mb-3 text-sm text-ink-dim">12 saatten eski {o.sweepable} maç silinir (versus_sweep).</p>
          <ActionForm run={runVersusSweep} fields={[]} submitLabel="Temizle" />
        </Card>
        <Card title="Bot (son 7 gün)">
          <Table head={["Seviye", "Biten", "Kazanma", "Ort. hata (yıl)"]} empty={o.bots.length === 0}>
            {o.bots.map((b) => (
              <tr key={b.level}>
                <Td>{b.level}</Td>
                <Td>{b.finished}</Td>
                <Td>{b.winRate === null ? "—" : `%${Math.round(b.winRate * 100)}`}</Td>
                <Td>{b.avgError ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="KP dağılımı" className="lg:col-span-2">
          <div className="flex h-28 items-end gap-1" role="img" aria-label="KP histogramı">
            {o.kpHistogram.map((b) => (
              <div key={b.bucket} className="flex flex-1 flex-col items-center gap-1" title={`${b.bucket}+: ${b.n}`}>
                <div className="w-full bg-accent" style={{ height: `${(b.n / maxKp) * 90}px` }} />
                <span className="text-[10px] text-ink-dim">{b.bucket}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Oynanan maçlar" className="lg:col-span-2">
          <MatchTable matches={o.live} closeLabel="Maçı sonlandır" />
        </Card>
        <Card title="Bekleyen odalar (son 30 dk)" className="lg:col-span-2">
          <p className="mb-3 text-sm text-ink-dim">
            Kurulmuş ama başlamamış odalar: rakip daha gelmemiş ya da iki taraf hazır demedi.
          </p>
          <MatchTable matches={o.waiting} closeLabel="Odayı kapat" />
        </Card>
        <Card title="Terk edilmiş" className="lg:col-span-2">
          <p className="mb-3 text-sm text-ink-dim">
            Kimsenin dönmediği odalar ve 10 dakikadır ilerlemeyen maçlar. 12 saat sonra temizleme bunları
            zaten siler; şimdi kapatmak da güvenli, KP etkilenmez.
          </p>
          <MatchTable matches={o.stale} closeLabel="Kapat" />
        </Card>
      </div>
    </>
  );
}

function MatchTable({ matches, closeLabel }: { matches: OpenMatch[]; closeLabel: string }) {
  return (
    <Table head={["Maç", "Faz", "Tur", "Tür", "Rakip", "Açıldı", "Son hareket", ""]} empty={matches.length === 0}>
      {matches.map((m) => (
        <tr key={m.id}>
          <Td className="text-ink-dim">{m.id.slice(0, 8)}</Td>
          <Td>{m.phase}</Td>
          <Td>
            {m.currentIdx + 1}/{m.totalRounds}
          </Td>
          <Td>
            {m.isPublic ? "çevrimiçi" : "arkadaş"}
            {m.hasBot ? " · bot" : ""}
          </Td>
          <Td>{m.opponentJoined ? "geldi" : <Badge tone="bad">yok</Badge>}</Td>
          <Td>{fmtDate(m.createdAt)}</Td>
          <Td>{fmtDate(m.updatedAt)}</Td>
          <Td>
            <ActionForm
              danger
              compact
              run={abandonMatch.bind(null, m.id)}
              fields={[{ name: "note", label: "Not", kind: "text" }]}
              submitLabel={closeLabel}
            />
          </Td>
        </tr>
      ))}
    </Table>
  );
}
