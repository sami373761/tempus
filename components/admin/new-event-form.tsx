"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { checkSlug, createEvent, suggestSlug } from "@/app/actions/admin/events";
import { uploadEventImage } from "@/app/actions/admin/images";
import { adminPath } from "@/lib/admin/path";
import { parseYearInput } from "@/lib/admin/year-input";
import { formatYear } from "@/lib/historical-date";
import { DICTIONARIES, dateLabels } from "@/lib/i18n/dictionary";

import { BUTTON, INPUT, LINK } from "./ui";

const TR = dateLabels(DICTIONARIES.tr);
const LOCALES = ["tr", "en", "de", "fr", "es"] as const;
const LICENSES = ["PD", "PD-US", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-3.0", "CC-BY-SA-3.0", "CC-BY-NC-4.0"];
const PD_LIKE = new Set(["PD", "PD-US", "CC0-1.0"]);

export type NewEventCategory = {
  slug: string;
  title: string;
  status: string;
  layout: "landscape" | "poster";
  bounds: { min: number; max: number } | null;
  tags: { slug: string; name: string }[];
};

/** §6.4 single form: category, year, five languages, tag, image, slug, preview. */
export function NewEventForm({ categories }: { categories: NewEventCategory[] }) {
  const [topic, setTopic] = useState("history");
  const [yearText, setYearText] = useState("");
  const [precision, setPrecision] = useState("year");
  const [tab, setTab] = useState<string>("tr");
  const [names, setNames] = useState<Record<string, { name: string; description: string }>>(
    Object.fromEntries(LOCALES.map((l) => [l, { name: "", description: "" }])),
  );
  const [tag, setTag] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<{ valid: boolean; taken: boolean } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [license, setLicense] = useState("PD");
  const [source, setSource] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string; id?: string } | null>(null);
  const [pending, start] = useTransition();

  const category = categories.find((c) => c.slug === topic) ?? null;
  const year = parseYearInput(yearText);
  const inBounds = year === null || !category?.bounds || (year >= category.bounds.min && year <= category.bounds.max);
  const en = names.en!.name;

  // Slug from the EN name until the operator edits it; uniqueness is live.
  useEffect(() => {
    if (slugEdited || !en.trim()) return;
    const handle = setTimeout(async () => {
      const r = await suggestSlug(en);
      if (r.ok) {
        setSlug(r.data.slug);
        setSlugState({ valid: Boolean(r.data.slug), taken: r.data.taken });
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [en, slugEdited]);

  useEffect(() => {
    if (!slugEdited) return;
    const handle = setTimeout(async () => {
      const r = await checkSlug(slug);
      if (r.ok) setSlugState({ valid: r.data.valid, taken: r.data.taken });
    }, 300);
    return () => clearTimeout(handle);
  }, [slug, slugEdited]);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function submit(publish: boolean) {
    setStatus(null);
    if (year === null) return setStatus({ ok: false, text: "Yıl: \"MÖ 500\", \"500\" veya \"MS 500\" biçiminde girin." });
    if (!inBounds) return setStatus({ ok: false, text: "Yıl kategorinin zaman çizelgesinin dışında." });
    const missing = LOCALES.filter((l) => !names[l]!.name.trim());
    if (missing.length) return setStatus({ ok: false, text: `Ad eksik: ${missing.join(", ").toUpperCase()}` });
    if (!slugState?.valid || slugState.taken) return setStatus({ ok: false, text: "Slug geçersiz veya kullanılıyor." });
    if (file && !PD_LIKE.has(license) && !source.trim()) return setStatus({ ok: false, text: "Bu lisansta kaynak adresi zorunlu." });
    start(async () => {
      const r = await createEvent(
        {
          topic: topic === "history" ? null : topic,
          slug,
          year,
          precision,
          isSensitive: sensitive,
          tag: tag || null,
          translations: LOCALES.map((l) => ({ locale: l, name: names[l]!.name, description: names[l]!.description || null })),
        },
        publish,
      );
      if (!r.ok) return setStatus({ ok: false, text: r.error });
      const id = String(r.data);
      if (file) {
        const u = await uploadEventImage(id, file, license, source, author, null);
        if (!u.ok) return setStatus({ ok: false, text: `Olay oluştu ama görsel yüklenemedi: ${u.error}`, id });
      }
      setStatus({ ok: true, text: r.message ?? "Kaydedildi.", id });
    });
  }

  const row = names[tab]!;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-ink-dim">
          1. Kategori
          <select className={INPUT} value={topic} onChange={(e) => { setTopic(e.target.value); setTag(""); }}>
            <option value="history">Tarih</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
                {c.status !== "published" ? " (taslak)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          2. Yıl
          <input className={INPUT} value={yearText} onChange={(e) => setYearText(e.target.value)} placeholder="MÖ 500 / 500 / MS 500" />
          <span className={inBounds ? "" : "text-bad"}>
            {year === null ? (yearText ? "Anlaşılmadı" : " ") : formatYear(year, TR)}
            {category?.bounds ? ` · çizelge ${formatYear(category.bounds.min, TR)}–${formatYear(category.bounds.max, TR)}` : ""}
            {!inBounds ? " · sınır dışı" : ""}
          </span>
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          Hassasiyet
          <select className={INPUT} value={precision} onChange={(e) => setPrecision(e.target.value)}>
            <option value="year">Yıl</option>
            <option value="decade">On yıl</option>
            <option value="century">Yüzyıl</option>
            <option value="millennium">Bin yıl</option>
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-ink-dim">3. Ad ve açıklama (5 dil, ad zorunlu)</div>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setTab(l)}
              className={`rounded-full border px-3 py-1 text-xs ${tab === l ? "border-accent" : "border-hairline text-ink-dim"}`}
            >
              {l.toUpperCase()}
              {!names[l]!.name.trim() ? <span className="ml-1 text-bad">•</span> : null}
            </button>
          ))}
        </div>
        <input className={INPUT} placeholder="Ad" value={row.name} onChange={(e) => setNames((o) => ({ ...o, [tab]: { ...o[tab]!, name: e.target.value } }))} />
        <textarea
          className={`${INPUT} min-h-20`}
          placeholder="Açıklama"
          value={row.description}
          onChange={(e) => setNames((o) => ({ ...o, [tab]: { ...o[tab]!, description: e.target.value } }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {category && category.tags.length > 0 ? (
          <label className="space-y-1 text-xs text-ink-dim">
            4. Ek etiket
            <select className={INPUT} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">—</option>
              {category.tags.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} /> 6. Hassas
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          7. Slug (EN addan)
          <input className={INPUT} value={slug} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }} />
          <span className={slugState && (!slugState.valid || slugState.taken) ? "text-bad" : "text-good"}>
            {!slugState ? " " : !slugState.valid ? "Geçersiz" : slugState.taken ? "Kullanılıyor" : "Uygun"}
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-ink-dim">5. Görsel (isteğe bağlı; görselsiz olay sitede gizli kalır)</div>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={INPUT} value={license} onChange={(e) => setLicense(e.target.value)}>
            {LICENSES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <input className={INPUT} value={source} onChange={(e) => setSource(e.target.value)} placeholder={PD_LIKE.has(license) ? "Kaynak (isteğe bağlı)" : "Kaynak (zorunlu)"} />
          <input className={INPUT} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Yazar (isteğe bağlı)" />
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs text-ink-dim">8. Önizleme</div>
        <div className={`overflow-hidden rounded-lg bg-card-raised ${category?.layout === "poster" ? "aspect-[2/3] w-40" : "aspect-video w-72"}`}>
          {preview ? <img src={preview} alt="" className={`h-full w-full object-cover ${sensitive ? "blur-md" : ""}`} /> : null}
        </div>
        <div className="mt-1 text-sm font-semibold">{names.tr!.name || "—"}</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className={BUTTON} disabled={pending} onClick={() => submit(false)}>
          Taslak kaydet
        </button>
        <button className={BUTTON} disabled={pending} onClick={() => submit(true)}>
          Yayınla
        </button>
        {pending ? <span className="text-sm text-ink-dim">Bekleyin…</span> : null}
        {status ? (
          <span className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>
            {status.text}{" "}
            {status.id ? (
              <Link className={LINK} href={adminPath(`olaylar/${status.id}`)}>
                Olayı aç
              </Link>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
