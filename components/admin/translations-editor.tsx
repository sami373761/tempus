"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveEventTranslations } from "@/app/actions/admin/events";
import { LOCALE_LABEL } from "@/lib/admin/labels";

import { BUTTON, INPUT } from "./ui";

const LOCALES = ["tr", "en", "de", "fr", "es"] as const;

type Row = { locale: string; name: string; description: string | null };

/** Five language tabs; a missing language is marked (§6.3). */
export function TranslationsEditor({ eventId, initial }: { eventId: string; initial: Row[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("tr");
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(LOCALES.map((l) => [l, initial.find((r) => r.locale === l) ?? { locale: l, name: "", description: "" }])),
  );
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const present = new Set(initial.map((r) => r.locale));
  const row = rows[tab]!;
  const set = (patch: Partial<Row>) => setRows((old) => ({ ...old, [tab]: { ...old[tab]!, ...patch } }));

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex flex-wrap gap-2">
        {LOCALES.map((l) => (
          <button
            key={l}
            role="tab"
            aria-selected={tab === l}
            onClick={() => setTab(l)}
            className={`rounded-full border px-3 py-1 text-xs ${tab === l ? "border-accent text-ink" : "border-hairline text-ink-dim"}`}
          >
            {l.toUpperCase()}
            {!present.has(l) ? <span className="ml-1 text-bad">• eksik</span> : null}
          </button>
        ))}
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-ink-dim">Ad ({LOCALE_LABEL[tab]}) *</span>
        <input className={INPUT} value={row.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-ink-dim">Açıklama</span>
        <textarea className={`${INPUT} min-h-24`} value={row.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <div className="flex items-center gap-3">
        <button
          className={BUTTON}
          disabled={pending}
          onClick={() =>
            start(async () => {
              // Only languages that have a name are sent: a tab left empty
              // for a missing language stays missing rather than failing.
              const send = Object.values(rows).filter((r) => r.name.trim() || present.has(r.locale));
              const result = await saveEventTranslations(eventId, JSON.stringify(send));
              setStatus(result.ok ? { ok: true, text: result.message ?? "Kaydedildi." } : { ok: false, text: result.error });
              if (result.ok) router.refresh();
            })
          }
        >
          {pending ? "Bekleyin…" : "Çevirileri kaydet"}
        </button>
        {status ? <span className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>{status.text}</span> : null}
      </div>
    </div>
  );
}
