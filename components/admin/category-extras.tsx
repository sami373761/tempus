"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveCategoryTags, uploadCategoryArt } from "@/app/actions/admin/categories";

import { BUTTON, INPUT } from "./ui";

const LOCALES = ["tr", "en", "de", "fr", "es"] as const;

type Tag = { slug: string; names: Record<string, string>; used?: number };

/** §7.6: the tag group's options, five names each; a used tag cannot go. */
export function TagEditor({ slug, initial }: { slug: string; initial: Tag[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {tags.map((t, i) => (
        <div key={i} className="grid gap-1 sm:grid-cols-7">
          <input className={INPUT} value={t.slug} disabled={Boolean(t.used)} placeholder="slug" onChange={(e) => setTags((o) => o.map((x, j) => (j === i ? { ...x, slug: e.target.value.toLowerCase() } : x)))} />
          {LOCALES.map((l) => (
            <input key={l} className={INPUT} value={t.names[l] ?? ""} placeholder={l} onChange={(e) => setTags((o) => o.map((x, j) => (j === i ? { ...x, names: { ...x.names, [l]: e.target.value } } : x)))} />
          ))}
          <button type="button" className="text-xs text-bad disabled:opacity-40" disabled={Boolean(t.used)} title={t.used ? `${t.used} olayda kullanılıyor` : ""} onClick={() => setTags((o) => o.filter((_, j) => j !== i))}>
            {t.used ? `${t.used} olay` : "Sil"}
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={BUTTON} onClick={() => setTags((o) => [...o, { slug: "", names: {} }])}>
          Seçenek ekle
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveCategoryTags(slug, tags.map(({ slug: s, names }) => ({ slug: s, names })));
              setStatus(r.ok ? { ok: true, text: r.message ?? "Kaydedildi." } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? "Bekleyin…" : "Etiketleri kaydet"}
        </button>
        {status ? <span className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>{status.text}</span> : null}
      </div>
    </div>
  );
}

/** Card image (→ .webp) or backdrop (JPEG ≥ 2560px → -1440/-2560 .jpg + .webp). */
export function ArtUpload({ slug, kind, current }: { slug: string; kind: "card" | "backdrop"; current: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <div className="text-ink-dim">Şu an: {current ?? "yok"}</div>
      <input type="file" accept={kind === "card" ? "image/jpeg,image/png,image/webp" : "image/jpeg"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {kind === "backdrop" ? <p className="text-xs text-ink-dim">JPEG, en az 2560 piksel genişlik. Master asla büyütülmez.</p> : null}
      <div className="flex items-center gap-3">
        <button
          className={BUTTON}
          disabled={!file || pending}
          onClick={() =>
            start(async () => {
              const r = await uploadCategoryArt(slug, kind, file!);
              setStatus(r.ok ? { ok: true, text: r.message ?? "Yüklendi." } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? "Yükleniyor…" : kind === "card" ? "Kart görseli yükle" : "Arka plan yükle"}
        </button>
        {status ? <span className={status.ok ? "text-good" : "text-bad"}>{status.text}</span> : null}
      </div>
    </div>
  );
}
