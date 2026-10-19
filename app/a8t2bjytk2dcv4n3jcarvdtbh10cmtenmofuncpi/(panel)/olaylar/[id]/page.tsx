import Link from "next/link";
import { notFound } from "next/navigation";

import { moveImageToEraFolder, updateImageAttribution } from "@/app/actions/admin/images";
import { ActionForm } from "@/components/admin/action-form";
import { CategoryForm, DeleteEventForm, SensitiveForm, StatusForm } from "@/components/admin/forms";
import { ImageUpload } from "@/components/admin/image-upload";
import { TranslationsEditor } from "@/components/admin/translations-editor";
import { Badge, Card, External, LINK, PageTitle, Table, Td } from "@/components/admin/ui";
import { CorrectYearForm } from "@/components/admin/year-forms";
import { adminCategories } from "@/lib/admin/categories-read";
import { fmtDate, VERDICT_LABEL } from "@/lib/admin/labels";
import { adminPath } from "@/lib/admin/path";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { publicImageUrl } from "@/lib/storage/images";

export const dynamic = "force-dynamic";

type Detail = {
  event: { id: string; slug: string; year: number; yearLabel: string; precision: string; status: string; isSensitive: boolean; era: string; adminEditedAt: string | null; topic: string | null; tag: string | null };
  translations: { locale: string; name: string; description: string | null }[];
  images: { id: string; key: string; isPrimary: boolean; width: number | null; height: number | null; bytes: number | null; license: string; sourcePageUrl: string | null; author: string | null; attribution: string | null }[];
  stats: { soloAnswers: number; versusRounds: number; verdicts: Record<string, number>; versusMedian: number | null; openVotes: number };
};

const LICENSES: [string, string][] = ["PD", "PD-US", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-3.0", "CC-BY-SA-3.0", "CC-BY-NC-4.0"].map((l) => [l, l]);

/** §6.3 editor. Slug is read-only. */
export default async function EventEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [raw, categories] = await Promise.all([adminRpc("admin_event_detail", { p_event_id: id }) as Promise<unknown>, adminCategories()]);
  const d = raw as Detail | null;
  if (!d) notFound();

  const category = d.event.topic
    ? ((await adminRpc("admin_category_detail", { p_slug: d.event.topic })) as unknown as {
        category: { layout: "landscape" | "poster" };
        tags: { slug: string; names: Record<string, string> }[];
      } | null)
    : null;
  const layout = category?.category.layout ?? "landscape";
  const tr = d.translations.find((t) => t.locale === "tr");
  const primary = d.images.find((i) => i.isPrimary);

  return (
    <>
      <PageTitle sub={`slug: ${d.event.slug} (salt okunur) · ${d.event.adminEditedAt ? `panelde düzenlendi ${fmtDate(d.event.adminEditedAt)}` : "seed'den"}`}>
        {tr?.name ?? d.event.slug}
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tarih" className="lg:col-span-2">
          <p className="mb-3 text-sm text-ink-dim">
            Şu an: <strong className="text-ink">{d.event.yearLabel}</strong> · açık oy {d.stats.openVotes} ·{" "}
            <Link className={LINK} href={adminPath(`itirazlar/${d.event.id}`)}>
              itiraz detayı
            </Link>
          </p>
          <CorrectYearForm eventId={d.event.id} year={String(d.event.year)} precision={d.event.precision} />
        </Card>

        <Card title="Oyunda önizleme">
          {/* The category's own frame (16:9 landscape, 2:3 poster), unmasked. */}
          <div className={`overflow-hidden rounded-lg bg-card-raised ${layout === "poster" ? "mx-auto aspect-[2/3] w-44" : "aspect-video w-full"}`}>
            {primary ? (
              <img src={publicImageUrl(primary.key)} alt="" className={`h-full w-full object-cover ${d.event.isSensitive ? "blur-md" : ""}`} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-dim">Görsel yok</div>
            )}
          </div>
          <div className="mt-2 text-sm font-semibold">{tr?.name}</div>
          <div className="text-xs text-ink-dim">{tr?.description}</div>
        </Card>

        <Card title="Çeviriler" className="lg:col-span-2">
          <TranslationsEditor eventId={d.event.id} initial={d.translations} />
        </Card>

        <Card title="Durum, hassasiyet, konu">
          <div className="space-y-4">
            <StatusForm eventId={d.event.id} status={d.event.status} />
            <SensitiveForm eventId={d.event.id} value={d.event.isSensitive} />
            <CategoryForm
              eventId={d.event.id}
              topic={d.event.topic}
              tag={d.event.tag}
              topics={[["history", "Tarih"], ...categories.map((c) => [c.slug, c.title] as [string, string])]}
              tags={(category?.tags ?? []).map((t) => [t.slug, t.names.tr ?? t.slug] as [string, string])}
            />
          </div>
        </Card>

        <Card title="Görseller" className="lg:col-span-2">
          <Table head={["Anahtar", "Boyut", "Lisans", "Kaynak", ""]} empty={d.images.length === 0}>
            {d.images.map((i) => (
              <tr key={i.id}>
                <Td>
                  {i.key} {i.isPrimary ? <Badge tone="good">ana</Badge> : null}
                </Td>
                <Td>
                  {i.width}×{i.height}
                  {i.bytes ? ` · ${Math.round(i.bytes / 1024)} KB` : ""}
                </Td>
                <Td>{i.license}</Td>
                <Td>{i.sourcePageUrl ? <External href={i.sourcePageUrl}>sayfa</External> : "—"}</Td>
                <Td>
                  <details>
                    <summary className="cursor-pointer text-xs text-accent">Atıfı düzelt</summary>
                    <div className="mt-2 w-72">
                      <ActionForm
                        run={updateImageAttribution.bind(null, i.id)}
                        fields={[
                          { name: "license", label: "Lisans", kind: "select", initial: i.license, options: LICENSES },
                          { name: "source", label: "Kaynak sayfası", kind: "url", initial: i.sourcePageUrl ?? "" },
                          { name: "author", label: "Yazar", kind: "text", initial: i.author ?? "" },
                          { name: "attribution", label: "Atıf metni", kind: "text", initial: i.attribution ?? "" },
                        ]}
                        submitLabel="Kaydet"
                      />
                    </div>
                  </details>
                </Td>
              </tr>
            ))}
          </Table>
          {!d.event.topic && primary && primary.key.split("/")[0] !== d.event.era ? (
            <div className="mt-3 text-sm">
              <p className="mb-2 text-bad">Görsel yanlış era klasöründe ({primary.key}).</p>
              <ActionForm run={moveImageToEraFolder.bind(null, d.event.id)} fields={[]} submitLabel="Klasöre taşı" />
            </div>
          ) : null}
          <div className="mt-4">
            <h3 className="mb-2 text-xs text-ink-dim">Görsel yükle / değiştir</h3>
            <ImageUpload eventId={d.event.id} layout={layout} />
          </div>
        </Card>

        <Card title="İstatistik">
          <ul className="space-y-1 text-sm">
            <li>Solo cevap: {d.stats.soloAnswers}</li>
            <li>Versus turu: {d.stats.versusRounds}</li>
            <li>Versus tahmin medyanı: {d.stats.versusMedian ?? "—"}</li>
            {Object.entries(d.stats.verdicts).map(([v, n]) => (
              <li key={v}>
                {VERDICT_LABEL[v] ?? v}: {n}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-dim">Dağıtımlar kaydedilmez; sayılar cevaplanan turlardır.</p>
        </Card>

        <Card title="Kalıcı sil" className="lg:col-span-3">
          <DeleteEventForm eventId={d.event.id} name={tr?.name ?? ""} />
        </Card>
      </div>
    </>
  );
}
