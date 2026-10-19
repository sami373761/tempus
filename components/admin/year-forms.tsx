"use client";

import Link from "next/link";

import { correctEventYear, previewYearChange } from "@/app/actions/admin/events";
import { adminPath } from "@/lib/admin/path";

import { ActionForm } from "./action-form";
import { LINK } from "./ui";

type Preview = {
  oldLabel: string;
  newLabel: string;
  oldEra: string;
  newEra: string;
  folderMismatch: boolean;
  imageKey: string | null;
  inBounds: boolean;
  bounds: { min: number; max: number } | null;
  pastDailies: number;
  upcomingDailies: number;
  closingVotes: number;
};

/** "Tarihi düzelt" with its impact preview (§6.2): preview first, then save. */
export function CorrectYearForm({
  eventId,
  year,
  precision,
}: {
  eventId: string;
  year: string;
  precision: string;
}) {
  return (
    <ActionForm
      run={(y, p, note) => correctEventYear(eventId, y, p, note)}
      preview={(y) => previewYearChange(eventId, y)}
      renderPreview={(data) => {
        const p = data as Preview;
        return (
          <ul className="space-y-1">
            <li>
              {p.oldLabel} → <strong>{p.newLabel}</strong>
            </li>
            <li>
              Era: {p.oldEra} → {p.newEra} {p.oldEra !== p.newEra ? "(değişiyor)" : "(aynı)"}
            </li>
            {p.folderMismatch ? (
              <li className="text-bad">
                Görsel yanlış klasörde kalacak ({p.imageKey}). Görseller sayfasından taşıyın:{" "}
                <Link className={LINK} href={adminPath("gorseller?sekme=klasor")}>
                  Klasör uyumsuzluğu
                </Link>
              </li>
            ) : null}
            <li>Geçmiş günlük bulmacada kullanıldı: {p.pastDailies} · gelecek günlerde: {p.upcomingDailies}</li>
            <li>Kapanacak açık oy: {p.closingVotes}</li>
          </ul>
        );
      }}
      fields={[
        { name: "year", label: "Yeni yıl", kind: "year", required: true, initial: year },
        {
          name: "precision",
          label: "Hassasiyet",
          kind: "select",
          initial: precision,
          options: [
            ["year", "Yıl"],
            ["decade", "On yıl"],
            ["century", "Yüzyıl"],
            ["millennium", "Bin yıl"],
          ],
        },
        { name: "note", label: "Not (zorunlu: kaynak, gerekçe)", kind: "textarea", required: true },
      ]}
      submitLabel="Tarihi düzelt"
    />
  );
}
