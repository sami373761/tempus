"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteOrphanImages } from "@/app/actions/admin/images";

import { BUTTON_DANGER } from "./ui";

/** Orphan `-<width>` rows: listed; deleting the selection is a double confirm. */
export function OrphanTable({ rows }: { rows: { imageId: string; key: string; slug: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-hairline">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.imageId} className="border-t border-hairline first:border-0">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`${r.key} seç`}
                    checked={selected.has(r.imageId)}
                    onChange={() =>
                      setSelected((o) => {
                        const n = new Set(o);
                        if (n.has(r.imageId)) n.delete(r.imageId);
                        else n.add(r.imageId);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">{r.key}</td>
                <td className="px-3 py-2 text-ink-dim">{r.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!armed ? (
          <button className={BUTTON_DANGER} disabled={selected.size === 0} onClick={() => setArmed(true)}>
            Seçilenleri sil ({selected.size})
          </button>
        ) : (
          <>
            <span className="text-sm text-bad">{selected.size} satır silinecek (R2 nesneleri silinmez). Emin misiniz?</span>
            <button
              className={BUTTON_DANGER}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteOrphanImages([...selected].join(","));
                  setStatus(r.ok ? { ok: true, text: r.message ?? "Silindi." } : { ok: false, text: r.error });
                  setArmed(false);
                  if (r.ok) {
                    setSelected(new Set());
                    router.refresh();
                  }
                })
              }
            >
              Evet, sil
            </button>
            <button className="text-sm text-ink-dim" onClick={() => setArmed(false)}>
              Vazgeç
            </button>
          </>
        )}
        {status ? <span className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>{status.text}</span> : null}
      </div>
    </div>
  );
}
