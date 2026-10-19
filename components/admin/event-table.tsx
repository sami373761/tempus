"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setEventStatus } from "@/app/actions/admin/events";
import { STATUS_LABEL } from "@/lib/admin/labels";

import { BUTTON, INPUT, LINK } from "./ui";

export type EventRow = {
  id: string;
  slug: string;
  yearLabel: string;
  status: string;
  topicLabel: string;
  isSensitive: boolean;
  hasImage: boolean;
  nameTr: string | null;
  nameEn: string | null;
  missingLocales: string[];
  href: string;
};

/** The event list with bulk selection for status changes (§6.3). */
export function EventTable({ rows }: { rows: EventRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("published");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) =>
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-dim">{selected.size} seçili</span>
        <select className={`${INPUT} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          className={BUTTON}
          disabled={pending || selected.size === 0}
          onClick={() =>
            start(async () => {
              const r = await setEventStatus([...selected].join(","), status);
              setMessage(r.ok ? { ok: true, text: `${r.data} olayın durumu değişti.` } : { ok: false, text: r.error });
              if (r.ok) {
                setSelected(new Set());
                router.refresh();
              }
            })
          }
        >
          {pending ? "Bekleyin…" : "Durumu değiştir"}
        </button>
        {message ? <span className={message.ok ? "text-good" : "text-bad"}>{message.text}</span> : null}
      </div>
      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-card-raised text-left text-xs text-ink-dim">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Tümünü seç"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2">Ad (TR / EN)</th>
              <th className="px-3 py-2">Konu</th>
              <th className="px-3 py-2">Yıl</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Görsel</th>
              <th className="px-3 py-2">Eksik dil</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-dim">
                  Kayıt yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`${r.slug} seç`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <Link className={LINK} href={r.href}>
                      {r.nameTr ?? r.slug}
                    </Link>
                    <div className="text-xs text-ink-dim">
                      {r.nameEn} · {r.slug}
                      {r.isSensitive ? " · hassas" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.topicLabel}</td>
                  <td className="px-3 py-2">{r.yearLabel}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className={`px-3 py-2 ${r.hasImage ? "" : "text-bad"}`}>{r.hasImage ? "var" : "yok (gizli)"}</td>
                  <td className="px-3 py-2 text-ink-dim">{r.missingLocales.join(", ") || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
