import { rerollDaily } from "@/app/actions/admin/daily";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, Card, PageTitle } from "@/components/admin/ui";
import { STATUS_LABEL } from "@/lib/admin/labels";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { dailyPuzzleDate } from "@/lib/game/daily";

export const dynamic = "force-dynamic";

type Day = {
  day: string;
  audience: "member" | "guest";
  drawn: boolean;
  plays: number;
  locked: boolean;
  events: { id: string; name: string; yearLabel: string; status: string; openVotes: number }[];
  missing: number;
  warning: boolean;
};

/**
 * §6.9: today + 14 days, both audiences, with the answer key (shown only
 * here). Days are drawn on first visit, so an undrawn future day reads as
 * such; rerolling one draws both audiences together, disjoint.
 */
export default async function DailyPage() {
  await requireAdminPage();
  const days = (await adminRpc("admin_daily_overview", { p_from: dailyPuzzleDate(), p_days: 15 })) as unknown as Day[];
  return (
    <>
      <PageTitle sub="Cevap anahtarı yalnız bu sayfada görünür. Bugün ve geçmiş kilitli; oynanmış gün yeniden çekilemez.">Günlük bulmaca</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {days.map((d) => (
          <Card key={`${d.day}-${d.audience}`} title={`${d.day} · ${d.audience === "member" ? "Üye" : "Misafir"}`}>
            <div className="mb-2 flex flex-wrap gap-2 text-xs">
              <Badge>{d.drawn ? `${d.plays} oynanma` : "henüz çekilmedi"}</Badge>
              {d.locked ? <Badge>kilitli</Badge> : null}
              {d.warning ? <Badge tone="bad">uyarı</Badge> : null}
            </div>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm">
              {d.events.map((e) => (
                <li key={e.id} className={e.status !== "published" || e.openVotes > 0 ? "text-bad" : ""}>
                  {e.name} — <strong>{e.yearLabel}</strong>
                  {e.status !== "published" ? ` (${STATUS_LABEL[e.status] ?? e.status})` : ""}
                  {e.openVotes > 0 ? ` · ${e.openVotes} açık itiraz` : ""}
                </li>
              ))}
            </ol>
            {d.missing > 0 ? <p className="text-sm text-bad">{d.missing} olay silinmiş.</p> : null}
            {!d.locked ? (
              <div className="mt-3">
                <ActionForm run={rerollDaily.bind(null, d.day, d.audience)} fields={[]} submitLabel="Bu günü yeniden çek" />
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}
