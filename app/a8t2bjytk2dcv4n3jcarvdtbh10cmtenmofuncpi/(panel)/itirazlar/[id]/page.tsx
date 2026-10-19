import Link from "next/link";
import { notFound } from "next/navigation";

import { dismissChallenges } from "@/app/actions/admin/events";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, Card, External, LINK, PageTitle, Table, Td } from "@/components/admin/ui";
import { CorrectYearForm } from "@/components/admin/year-forms";
import { fmtDate, LOCALE_LABEL, PRECISION_LABEL, STATUS_LABEL, topicLabel } from "@/lib/admin/labels";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { publicImageUrl } from "@/lib/storage/images";

export const dynamic = "force-dynamic";

type Detail = {
  event: { id: string; slug: string; year: number; yearLabel: string; precision: string; status: string; topic: string | null; era: string; isSensitive: boolean };
  translations: { locale: string; name: string; description: string | null }[];
  image: { id: string; key: string; sourcePageUrl: string | null; license: string } | null;
  tally: { later: number; earlier: number; total: number };
  daily: { day: string; later: number; earlier: number }[];
  locales: { locale: string; n: number }[];
  singleLocaleWarning: boolean;
  solo: { answers: number; poorRate: number | null; peerPoorRate: number | null };
  versus: { answers: number; median: number | null; offset: number | null };
  yearHistory: { auditId: number; at: string; before: { year: number }; after: { year: number; closedVotes?: number }; note: string | null }[];
  reviews: { year: number; at: string; note: string | null }[];
};

const pct = (v: number | null) => (v === null ? "—" : `%${Math.round(v * 100)}`);

/** §6.2 detail: event card, 90-day chart, language split, player signal, history. */
export default async function ChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = (await adminRpc("admin_challenge_detail", { p_event_id: id })) as unknown as Detail | null;
  if (!d) notFound();

  const tr = d.translations.find((t) => t.locale === "tr");
  const en = d.translations.find((t) => t.locale === "en");
  const max = Math.max(1, ...d.daily.map((x) => x.later + x.earlier));

  return (
    <>
      <PageTitle sub={`${d.event.slug} · ${topicLabel(d.event.topic)}`}>{tr?.name ?? d.event.slug}</PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Olay" className="lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row">
            {d.image ? (
              <img
                src={publicImageUrl(d.image.key)}
                alt=""
                className={`h-40 w-full rounded-lg object-cover sm:w-64 ${d.event.isSensitive ? "blur-md hover:blur-none" : ""}`}
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-lg bg-card-raised text-sm text-ink-dim sm:w-64">Görsel yok (olay gizli)</div>
            )}
            <div className="space-y-1 text-sm">
              <div>
                Yıl: <strong>{d.event.yearLabel}</strong> ({PRECISION_LABEL[d.event.precision] ?? d.event.precision}) · era {d.event.era}
              </div>
              <div>Durum: {STATUS_LABEL[d.event.status] ?? d.event.status}</div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link className={LINK} href={adminPath(`olaylar/${d.event.id}`)}>
                  Adı düzelt / editör
                </Link>
                {d.image?.sourcePageUrl ? <External href={d.image.sourcePageUrl}>Görselin kaynağı</External> : null}
                {tr ? <External href={`https://tr.wikipedia.org/w/index.php?search=${encodeURIComponent(tr.name)}`}>Wikipedia (TR)</External> : null}
                {en ? <External href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(en.name)}`}>Wikipedia (EN)</External> : null}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {d.translations.map((t) => (
              <div key={t.locale} className="text-sm">
                <Badge>{t.locale.toUpperCase()}</Badge> <strong>{t.name}</strong>
                <div className="text-ink-dim">{t.description ?? "— açıklama yok —"}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Açık oylar">
          <div className="space-y-1 text-sm">
            <div>↑ daha geç: {d.tally.later}</div>
            <div>↓ daha erken: {d.tally.earlier}</div>
            <div>Toplam: {d.tally.total}</div>
          </div>
          <h3 className="mt-4 text-xs text-ink-dim">Dil kırılımı</h3>
          <ul className="text-sm">
            {d.locales.map((l) => (
              <li key={l.locale}>
                {LOCALE_LABEL[l.locale] ?? l.locale}: {l.n}
              </li>
            ))}
          </ul>
          {d.singleLocaleWarning ? <p className="mt-2 text-sm text-bad">Oyların %70+'ı tek dilden: çeviri sorunu olabilir.</p> : null}
        </Card>

        <Card title="Son 90 gün" className="lg:col-span-2">
          {d.daily.length === 0 ? (
            <p className="text-sm text-ink-dim">Oy yok.</p>
          ) : (
            <div className="flex h-32 items-end gap-1 overflow-x-auto" role="img" aria-label="Günlük oy grafiği">
              {d.daily.map((x) => (
                <div key={x.day} className="flex w-3 shrink-0 flex-col justify-end" title={`${x.day}: ↑${x.later} ↓${x.earlier}`}>
                  <div className="bg-accent" style={{ height: `${(x.later / max) * 100}%` }} />
                  <div className="bg-ink-dim" style={{ height: `${(x.earlier / max) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-ink-dim">Mavi: daha geç · gri: daha erken</p>
        </Card>

        <Card title="Oyuncu sinyali">
          <ul className="space-y-1 text-sm">
            <li>
              Solo cevap: {d.solo.answers} · Çok uzak + Kötü: {pct(d.solo.poorRate)} (konu ortalaması {pct(d.solo.peerPoorRate)})
            </li>
            <li>
              Versus tahmini: {d.versus.answers} · medyan {d.versus.median ?? "—"}
              {d.versus.offset !== null ? ` (saklanan yıla fark ${d.versus.offset > 0 ? "+" : ""}${Math.round(d.versus.offset)})` : ""}
            </li>
          </ul>
        </Card>

        <Card title="Tarihi düzelt" className="lg:col-span-2">
          <CorrectYearForm eventId={d.event.id} year={String(d.event.year)} precision={d.event.precision} />
        </Card>

        <Card title="Tarih doğru, kapat">
          <ActionForm
            run={dismissChallenges.bind(null, d.event.id)}
            fields={[{ name: "note", label: "Not (isteğe bağlı)", kind: "textarea" }]}
            submitLabel="İtirazları kapat"
          />
        </Card>

        <Card title="Geçmiş yıllar ve incelemeler" className="lg:col-span-3">
          <Table head={["Zaman", "Değişiklik", "Kapanan oy", "Not"]} empty={d.yearHistory.length === 0 && d.reviews.length === 0}>
            {d.yearHistory.map((h) => (
              <tr key={h.auditId}>
                <Td>{fmtDate(h.at)}</Td>
                <Td>
                  {h.before.year} → {h.after.year}
                </Td>
                <Td>{h.after.closedVotes ?? "—"}</Td>
                <Td>{h.note}</Td>
              </tr>
            ))}
            {d.reviews.map((r, i) => (
              <tr key={`r${i}`}>
                <Td>{fmtDate(r.at)}</Td>
                <Td>İncelendi, kapatıldı (yıl {r.year})</Td>
                <Td>—</Td>
                <Td>{r.note}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
