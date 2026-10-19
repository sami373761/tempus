"use client";

/**
 * Client wrappers that pair an action with its field list and preview
 * renderer — the parts a Server Component cannot pass across (functions).
 */
import { deleteEventPermanently, previewDeleteEvent, setEventCategory, setEventSensitive, setEventStatus } from "@/app/actions/admin/events";
import { deleteUser, previewDeleteUser } from "@/app/actions/admin/users";
import { STATUS_LABEL } from "@/lib/admin/labels";

import { ActionForm } from "./action-form";
import { CountList } from "./delete-preview";

export function StatusForm({ eventId, status }: { eventId: string; status: string }) {
  return (
    <ActionForm
      compact
      run={(s) => setEventStatus(eventId, s)}
      fields={[{ name: "status", label: "Durum", kind: "select", initial: status, options: Object.entries(STATUS_LABEL) }]}
      submitLabel="Durumu değiştir"
    />
  );
}

export function SensitiveForm({ eventId, value }: { eventId: string; value: boolean }) {
  return (
    <ActionForm
      compact
      run={(v) => setEventSensitive(eventId, v)}
      fields={[{ name: "value", label: "Hassas (görsel bulanık açılır)", kind: "checkbox", initial: value }]}
      submitLabel="Kaydet"
    />
  );
}

export function CategoryForm({
  eventId,
  topic,
  tag,
  topics,
  tags,
}: {
  eventId: string;
  topic: string | null;
  tag: string | null;
  topics: [string, string][];
  tags: [string, string][];
}) {
  return (
    <ActionForm
      run={(t, g) => setEventCategory(eventId, t, g)}
      fields={[
        { name: "topic", label: "Konu", kind: "select", initial: topic ?? "history", options: topics },
        { name: "tag", label: "Ek etiket (yalnız etiketli kategoride)", kind: "select", initial: tag ?? "", options: [["", "—"], ...tags] },
      ]}
      submitLabel="Konuyu/etiketi değiştir"
    />
  );
}

export function DeleteEventForm({ eventId, name }: { eventId: string; name: string }) {
  return (
    <ActionForm
      danger
      run={(typed) => deleteEventPermanently(eventId, typed)}
      preview={() => previewDeleteEvent(eventId)}
      renderPreview={(d) => (
        <CountList
          data={d}
          labels={{
            translations: "Çeviri",
            images: "Görsel satırı",
            imageKeys: "R2 anahtarları (silinmez, kayda yazılır)",
            soloAnswers: "Solo cevap",
            matchRounds: "Versus turu",
            challenges: "İtiraz",
            pastDailies: "Geçmiş günlük",
            upcomingDailies: "Yaklaşan günlük (varsa silme reddedilir)",
          }}
        />
      )}
      confirmText={name}
      confirmHint="Silmek için olayın Türkçe adını aynen yazın:"
      fields={[]}
      submitLabel="Kalıcı olarak sil"
    />
  );
}

export function DeleteUserForm({ userId, confirm }: { userId: string; confirm: string }) {
  return (
    <ActionForm
      danger
      run={(typed) => deleteUser(userId, typed)}
      preview={() => previewDeleteUser(userId)}
      renderPreview={(d) => (
        <CountList
          data={d}
          labels={{
            scoreEntries: "TP defter satırı",
            soloSets: "Solo set",
            soloAnswers: "Solo cevap",
            dailyAttempts: "Günlük deneme",
            chronoEntries: "KP satırı",
            badges: "Rozet ilerlemesi",
            challenges: "İtiraz oyu",
            matchSeats: "Versus koltuğu (kimliksizleşir)",
          }}
        />
      )}
      confirmText={confirm}
      confirmHint="Silmek için kullanıcı adını aynen yazın:"
      fields={[]}
      submitLabel="Hesabı sil"
    />
  );
}
