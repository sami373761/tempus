"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createCategory, updateCategory, type CategoryInput } from "@/app/actions/admin/categories";
import { adminPath } from "@/lib/admin/path";
import { parseYearInput } from "@/lib/admin/year-input";
import { autoBands, densityHint, describeBands, paneFromRange, paneYearRange, panesProblem, suggestTickStep } from "@/lib/game/auto-bands";
import type { CategoryPane } from "@/lib/game/builtin-categories";
import type { BandSet } from "@/lib/game/scoring";
import { formatYear } from "@/lib/historical-date";
import { DICTIONARIES, dateLabels } from "@/lib/i18n/dictionary";

import { BUTTON, INPUT } from "./ui";

const TR = dateLabels(DICTIONARIES.tr);
const LOCALES = ["tr", "en", "de", "fr", "es"] as const;

type PaneDraft = { key: string; label: Record<string, string>; start: string; end: string; tickStep: string; stepYears: string };

function draftOf(p: CategoryPane): PaneDraft {
  const r = paneYearRange(p);
  return {
    key: p.key,
    label: { ...p.label },
    start: String(r.min),
    end: String(r.max),
    tickStep: String("tickStep" in p ? p.tickStep : ""),
    stepYears: String("stepYears" in p ? p.stepYears : 1),
  };
}

export interface CategoryEditorProps {
  mode: "create" | "edit";
  slug?: string;
  isBuiltin?: boolean;
  initial?: {
    layout: "landscape" | "poster";
    panes: CategoryPane[];
    defaultPane: string;
    bands: BandSet;
    imagePrefix: string;
    tagKind: string | null;
    titles: { locale: string; title: string; blurb: string | null }[];
  };
  years?: number[];
}

/**
 * The category form (§7.2–§7.4): titles, rails, opening rail, tag group.
 * Difficulty has no input — the bands are computed from the rails and shown
 * read-only. A built-in category's rails, layout and folder are fixed (its
 * games read their tuned constants; see LOKAL_KURULUM.md "Sözleşmeden
 * sapmalar"), so only its titles and tag group are editable here.
 */
export function CategoryEditor({ mode, slug: initialSlug, isBuiltin = false, initial, years = [] }: CategoryEditorProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [imagePrefix, setImagePrefix] = useState(initial?.imagePrefix ?? "");
  const [tagOn, setTagOn] = useState(Boolean(initial?.tagKind));
  const [tagKind, setTagKind] = useState(initial?.tagKind ?? "");
  const [titles, setTitles] = useState<Record<string, { title: string; blurb: string }>>(() =>
    Object.fromEntries(
      LOCALES.map((l) => {
        const t = initial?.titles.find((x) => x.locale === l);
        return [l, { title: t?.title ?? "", blurb: t?.blurb ?? "" }];
      }),
    ),
  );
  const [panes, setPanes] = useState<PaneDraft[]>(() =>
    initial ? initial.panes.map(draftOf) : [{ key: "", label: {}, start: "1900", end: "2026", tickStep: "25", stepYears: "1" }],
  );
  const [defaultIdx, setDefaultIdx] = useState(() => Math.max(0, initial ? initial.panes.findIndex((p) => p.key === initial.defaultPane) : 0));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const locked = isBuiltin;

  // Keys of a new category's rails are `<slug>--<n>`; built-in keys stay.
  const built = useMemo(() => {
    const out: CategoryPane[] = [];
    for (const [i, d] of panes.entries()) {
      const s = parseYearInput(d.start);
      const e = parseYearInput(d.end);
      if (s === null || e === null) return { error: `Dönem ${i + 1}: yıl anlaşılmadı.` };
      const key = locked && d.key ? d.key : `${slug || "kategori"}--${i + 1}`;
      const label = panes.length === 1 ? Object.fromEntries(LOCALES.map((l) => [l, titles[l]!.title || slug])) : d.label;
      const p = paneFromRange({ key, label, start: s, end: e, tickStep: Number(d.tickStep) || suggestTickStep(e - s), stepYears: Number(d.stepYears) || 1 });
      if (typeof p === "string") return { error: `Dönem ${i + 1}: ${p}` };
      out.push(p as CategoryPane);
    }
    const problem = panesProblem(out, out[defaultIdx]?.key ?? "");
    return problem ? { error: problem } : { panes: out };
  }, [panes, slug, titles, defaultIdx, locked]);

  const bands = "panes" in built && built.panes ? autoBands(built.panes) : null;
  const bounds = "panes" in built && built.panes ? {
    min: Math.min(...built.panes.map((p) => paneYearRange(p).min)),
    max: Math.max(...built.panes.map((p) => paneYearRange(p).max)),
  } : null;
  const outside = bounds ? years.filter((y) => y < bounds.min || y > bounds.max) : [];
  const hint = "panes" in built && built.panes ? densityHint(years, built.panes) : null;

  function update(i: number, patch: Partial<PaneDraft>) {
    setPanes((old) => old.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function save() {
    setStatus(null);
    if (!("panes" in built) || !built.panes) return setStatus({ ok: false, text: built.error ?? "Çizelge geçersiz." });
    if (outside.length > 0) return setStatus({ ok: false, text: `${outside.length} olay çizelge dışında kalıyor; kaydedilemez.` });
    const input: CategoryInput = {
      slug,
      layout: initial?.layout ?? "landscape",
      panes: locked && initial ? initial.panes : built.panes,
      defaultPane: locked && initial ? initial.defaultPane : built.panes[defaultIdx]!.key,
      imagePrefix,
      tagKind: tagOn ? tagKind || null : null,
      titles: LOCALES.map((l) => ({ locale: l, title: titles[l]!.title, blurb: titles[l]!.blurb || null })),
      applyBands: false,
    };
    start(async () => {
      const r = mode === "create" ? await createCategory(input) : await updateCategory(slug, input);
      setStatus(r.ok ? { ok: true, text: r.message ?? "Kaydedildi." } : { ok: false, text: r.error });
      if (r.ok && mode === "create") router.push(adminPath(`kategoriler/${slug}`));
      else if (r.ok) router.refresh();
    });
  }

  // Histogram over the timeline, with rail boundaries.
  const histogram = useMemo(() => {
    if (!bounds || years.length === 0) return null;
    const bins = 40;
    const width = Math.max(1, bounds.max - bounds.min);
    const counts = new Array(bins).fill(0) as number[];
    for (const y of years) {
      const i = Math.min(bins - 1, Math.max(0, Math.floor(((y - bounds.min) / width) * bins)));
      counts[i]! += 1;
    }
    return { counts, max: Math.max(1, ...counts), width };
  }, [years, bounds]);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-ink-dim">
          Kısa ad (slug)
          <input className={INPUT} value={slug} disabled={mode === "edit"} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="ornek-kategori" />
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          Görsel klasörü (R2)
          <input className={INPUT} value={imagePrefix} disabled={locked} onChange={(e) => setImagePrefix(e.target.value.toLowerCase())} placeholder={slug || "klasor"} />
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          Görünüm
          <select className={INPUT} value={initial?.layout ?? "landscape"} disabled>
            <option value="landscape">Yatay (TimelineGame)</option>
            <option value="poster">Poster</option>
          </select>
          {mode === "create" ? <span>Yeni kategoriler yalnız yatay görünümde oynanabilir (PosterGame birleştirmesi yapılmadı).</span> : null}
        </label>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs text-ink-dim">Başlık ve kart açıklaması (5 dil)</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {LOCALES.map((l) => (
            <div key={l} className="flex gap-2">
              <span className="w-8 pt-2 text-xs text-ink-dim">{l.toUpperCase()}</span>
              <input className={INPUT} placeholder="Başlık" value={titles[l]!.title} onChange={(e) => setTitles((o) => ({ ...o, [l]: { ...o[l]!, title: e.target.value } }))} />
              <input className={INPUT} placeholder="Açıklama" value={titles[l]!.blurb} onChange={(e) => setTitles((o) => ({ ...o, [l]: { ...o[l]!, blurb: e.target.value } }))} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tagOn} onChange={(e) => setTagOn(e.target.checked)} /> Ek etiket grubu
        </label>
        {tagOn ? (
          <input className={`${INPUT} max-w-xs`} value={tagKind} onChange={(e) => setTagKind(e.target.value.toLowerCase())} placeholder="grup-adi (ör. screen-format)" />
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs text-ink-dim">Zaman çizelgesi {locked ? "(yerleşik kategoride salt okunur)" : ""}</h3>
        {panes.map((p, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-hairline p-3 sm:grid-cols-6">
            <label className="flex items-center gap-2 text-xs text-ink-dim sm:col-span-6">
              <input type="radio" name="default-pane" checked={defaultIdx === i} disabled={locked} onChange={() => setDefaultIdx(i)} /> Açılış dönemi · Dönem {i + 1}
            </label>
            <input className={INPUT} disabled={locked} value={p.start} onChange={(e) => update(i, { start: e.target.value })} placeholder="Başlangıç (MÖ 1500)" />
            <input className={INPUT} disabled={locked} value={p.end} onChange={(e) => update(i, { end: e.target.value })} placeholder="Bitiş (2026)" />
            <input className={INPUT} disabled={locked} value={p.tickStep} onChange={(e) => update(i, { tickStep: e.target.value })} placeholder="Çizgi aralığı" />
            <input className={INPUT} disabled={locked} value={p.stepYears} onChange={(e) => update(i, { stepYears: e.target.value })} placeholder="Adım (yıl)" />
            <button
              type="button"
              className="text-xs text-ink-dim hover:text-ink"
              disabled={locked}
              onClick={() => {
                const s = parseYearInput(p.start);
                const e = parseYearInput(p.end);
                if (s !== null && e !== null) update(i, { tickStep: String(suggestTickStep(e - s)) });
              }}
            >
              Aralığı öner
            </button>
            <span className="flex gap-2">
              <button type="button" className="text-xs text-ink-dim" disabled={locked || i === 0} onClick={() => setPanes((o) => { const n = [...o]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n; })}>↑</button>
              <button type="button" className="text-xs text-ink-dim" disabled={locked || i === panes.length - 1} onClick={() => setPanes((o) => { const n = [...o]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; return n; })}>↓</button>
              <button type="button" className="text-xs text-bad" disabled={locked || panes.length === 1} onClick={() => { setPanes((o) => o.filter((_, j) => j !== i)); setDefaultIdx(0); }}>Sil</button>
            </span>
            {panes.length > 1 ? (
              <div className="grid gap-1 sm:col-span-6 sm:grid-cols-5">
                {LOCALES.map((l) => (
                  <input key={l} className={INPUT} disabled={locked} placeholder={`Ad (${l})`} value={p.label[l] ?? ""} onChange={(e) => update(i, { label: { ...p.label, [l]: e.target.value } })} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {!locked ? (
          <button
            type="button"
            className={BUTTON}
            onClick={() => setPanes((o) => [...o, { key: "", label: {}, start: o[o.length - 1]?.end ?? "0", end: "2026", tickStep: "", stepYears: "1" }])}
          >
            Dönem ekle
          </button>
        ) : null}
        {"error" in built && built.error ? <p className="text-sm text-bad">{built.error}</p> : null}
        {bounds ? (
          <p className="text-sm text-ink-dim">
            Çizelge: {formatYear(bounds.min, TR)} – {formatYear(bounds.max, TR)}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs text-ink-dim">Olay dağılımı</h3>
        {histogram && bounds && "panes" in built && built.panes ? (
          <div className="relative flex h-24 items-end gap-px rounded-lg bg-page p-1" role="img" aria-label="Olayların yıllara göre dağılımı">
            {histogram.counts.map((n, i) => (
              <div key={i} className="flex-1 bg-accent" style={{ height: `${(n / histogram.max) * 100}%` }} />
            ))}
            {built.panes.slice(1).map((p) => (
              <div key={p.key} className="absolute inset-y-0 w-px bg-bad" style={{ left: `${((paneYearRange(p).min - bounds.min) / histogram.width) * 100}%` }} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-dim">Olay yok.</p>
        )}
        {outside.length > 0 ? (
          <p className="text-sm text-bad">
            Çizelge dışında {outside.length} olay: {outside.slice(0, 20).join(", ")}
            {outside.length > 20 ? "…" : ""}
          </p>
        ) : null}
        {hint ? <p className="text-sm text-ink-dim">{hint}</p> : null}
      </section>

      <section className="space-y-1">
        <h3 className="text-xs text-ink-dim">Zorluk (otomatik, salt okunur)</h3>
        {initial && isBuiltin ? <p className="text-sm">Yerleşik bantlar: {describeBands(initial.bands)}</p> : null}
        {bands ? (
          <p className="text-sm">
            {isBuiltin ? "Çizelgeden hesaplanan (uygulanmaz): " : "Bu kategoride: "}
            {describeBands(bands)}
          </p>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <button className={BUTTON} disabled={pending} onClick={save}>
          {pending ? "Bekleyin…" : mode === "create" ? "Yeni kategori (taslak)" : "Kaydet"}
        </button>
        {status ? <span className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>{status.text}</span> : null}
      </div>
    </div>
  );
}
