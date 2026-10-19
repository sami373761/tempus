"use client";

import { useState, useTransition } from "react";

import { importBulkEvents, parseBulkEvents } from "@/app/actions/admin/events";
import type { BulkParse } from "@/lib/admin/bulk-parse";

import { BUTTON, INPUT } from "./ui";

/** §6.4 bulk: upload → parse and report → preview → add all (no images). */
export function BulkImport({ topics }: { topics: [string, string][] }) {
  const [topic, setTopic] = useState(topics[0]?.[0] ?? "history");
  const [parsed, setParsed] = useState<BulkParse | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-ink-dim">
          Kategori
          <select className={INPUT} value={topic} onChange={(e) => { setTopic(e.target.value); setParsed(null); }}>
            {topics.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <input
          type="file"
          accept="application/json,.json"
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setParsed(null);
            setStatus(null);
            if (!f) return;
            start(async () => {
              const r = await parseBulkEvents(topic, await f.text());
              if (r.ok) setParsed(r.data);
              else setStatus({ ok: false, text: r.error });
            });
          }}
        />
      </div>

      {parsed ? (
        <>
          <p className="text-sm">
            {parsed.rows.length} satır geçerli · {parsed.failures.length} hata
          </p>
          {parsed.failures.length > 0 ? (
            <ul className="max-h-48 overflow-auto rounded-lg border border-bad p-3 text-sm text-bad">
              {parsed.failures.map((f, i) => (
                <li key={i}>
                  #{f.index + 1} {f.id}: {f.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="max-h-96 overflow-auto rounded-xl border border-hairline">
            <table className="w-full text-sm">
              <thead className="bg-card-raised text-left text-xs text-ink-dim">
                <tr>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">Yıl</th>
                  <th className="px-3 py-2">TR</th>
                  <th className="px-3 py-2">EN</th>
                  <th className="px-3 py-2">Etiket</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.slug} className="border-t border-hairline">
                    <td className="px-3 py-1">{r.slug}</td>
                    <td className="px-3 py-1">{r.year}</td>
                    <td className="px-3 py-1">{r.translations.find((t) => t.locale === "tr")?.name}</td>
                    <td className="px-3 py-1">{r.translations.find((t) => t.locale === "en")?.name}</td>
                    <td className="px-3 py-1">{r.tag ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            {(["draft", "published"] as const).map((s) => (
              <button
                key={s}
                className={BUTTON}
                disabled={pending || parsed.rows.length === 0 || parsed.failures.length > 0}
                onClick={() =>
                  start(async () => {
                    const r = await importBulkEvents(topic, parsed.rows, s);
                    setStatus(r.ok ? { ok: true, text: `${r.data} olay eklendi.` } : { ok: false, text: r.error });
                    if (r.ok) setParsed(null);
                  })
                }
              >
                {s === "draft" ? "Hepsini ekle (taslak)" : "Hepsini ekle (yayında)"}
              </button>
            ))}
          </div>
          {parsed.failures.length > 0 ? <p className="text-xs text-ink-dim">Hatalı satır varken ekleme kapalı: dosyayı düzeltip yeniden yükleyin.</p> : null}
        </>
      ) : null}
      {pending ? <p className="text-sm text-ink-dim">Bekleyin…</p> : null}
      {status ? <p className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>{status.text}</p> : null}
    </div>
  );
}
