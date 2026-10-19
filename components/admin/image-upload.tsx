"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { uploadEventImage } from "@/app/actions/admin/images";

import { BUTTON, INPUT } from "./ui";

const LICENSES = ["PD", "PD-US", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-3.0", "CC-BY-SA-3.0", "CC-BY-NC-4.0"];
const PD_LIKE = new Set(["PD", "PD-US", "CC0-1.0"]);
const MAX = 25 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Drag-and-drop upload (§6.5): jpg/png/webp/avif ≤ 25 MB, PD by default.
 * Shows the crop the category's layout will apply (16:9 landscape, 2:3
 * poster) and warns when the picture's shape differs.
 */
export function ImageUpload({ eventId, layout = "landscape" }: { eventId: string; layout?: "landscape" | "poster" }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [license, setLicense] = useState("PD");
  const [source, setSource] = useState("");
  const [author, setAuthor] = useState("");
  const [attribution, setAttribution] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    const img = new Image();
    img.onload = () => setRatio(img.naturalWidth / img.naturalHeight);
    img.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  function pick(f: File | undefined) {
    setStatus(null);
    if (!f) return;
    if (!TYPES.includes(f.type)) return setStatus({ ok: false, text: "Yalnız JPG, PNG, WebP veya AVIF." });
    if (f.size > MAX) return setStatus({ ok: false, text: "Dosya 25 MB'tan büyük." });
    setFile(f);
  }

  const target = layout === "poster" ? 2 / 3 : 16 / 9;
  const mismatch = ratio !== null && Math.abs(ratio - target) / target > 0.12;

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-sm ${over ? "border-accent" : "border-hairline"} text-ink-dim`}
      >
        <input type="file" accept={TYPES.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        {file ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB` : "Görseli buraya sürükleyin veya tıklayın (≤ 25 MB)"}
      </label>

      {url ? (
        <div className="space-y-1">
          <div className={`overflow-hidden rounded-lg bg-card-raised ${layout === "poster" ? "aspect-[2/3] w-40" : "aspect-video w-72"}`}>
            <img src={url} alt="Önizleme" className="h-full w-full object-cover" />
          </div>
          {mismatch ? (
            <p className="text-xs text-bad">
              Bu görsel {ratio! > 1 ? "yatay" : "dikey"} ({ratio!.toFixed(2)}); {layout === "poster" ? "poster" : "yatay"} görünümünde kenarları kırpılacak.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-ink-dim">
          Lisans
          <select className={INPUT} value={license} onChange={(e) => setLicense(e.target.value)}>
            {LICENSES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          Kaynak sayfası {PD_LIKE.has(license) ? "(isteğe bağlı)" : "(zorunlu)"}
          <input className={INPUT} value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://" />
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          Yazar (isteğe bağlı)
          <input className={INPUT} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-ink-dim">
          Atıf metni (isteğe bağlı)
          <input className={INPUT} value={attribution} onChange={(e) => setAttribution(e.target.value)} />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          className={BUTTON}
          disabled={!file || pending || (!PD_LIKE.has(license) && !source.trim())}
          onClick={() =>
            start(async () => {
              const r = await uploadEventImage(eventId, file!, license, source, author, attribution);
              setStatus(r.ok ? { ok: true, text: r.message ?? "Yüklendi." } : { ok: false, text: r.error });
              if (r.ok) {
                setFile(null);
                setUrl(null);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Yükleniyor ve küçültülüyor…" : "Görsel yükle"}
        </button>
        {status ? <span className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>{status.text}</span> : null}
      </div>
    </div>
  );
}
