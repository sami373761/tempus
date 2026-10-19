"use server";

import { guard, fail } from "@/lib/admin/guard";
import { parseBulk, type BulkParse, type BulkRow } from "@/lib/admin/bulk-parse";
import { revalidate } from "@/lib/admin/revalidate";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { createAdminDbClient } from "@/lib/db/admin";
import type { Json } from "@/lib/db/database.types";
import { SUPPORTED_LOCALES } from "@/lib/db/types";
import { slugify } from "@/scripts/parse-events";

/**
 * Event and date-challenge writes (§6.2–§6.4). Every export's first line is
 * `await requireAdmin()` — admin:check verifies it statically. Arguments
 * arrive from the browser as strings/booleans and are parsed here; the
 * admin_* function is the second check.
 */

type Arg = string | number | boolean | null | undefined;

const PRECISIONS = ["year", "decade", "century", "millennium"] as const;
const STATUSES = ["draft", "review", "published", "archived"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value: Arg): string {
  const s = String(value ?? "");
  if (!UUID.test(s)) fail("Geçersiz kimlik.");
  return s;
}

function year(value: Arg): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(n)) fail("Geçersiz yıl.");
  return n;
}

function text(value: Arg): string | null {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? null : s;
}

function oneOf<T extends string>(value: Arg, list: readonly T[], label: string): T {
  const s = String(value ?? "");
  if (!(list as readonly string[]).includes(s)) fail(`Geçersiz ${label}.`);
  return s as T;
}

export async function previewYearChange(eventId: Arg, newYear: Arg) {
  await requireAdmin();
  return guard(async () => {
    const preview = await adminRpc("admin_year_change_preview", { p_event_id: uuid(eventId), p_new_year: year(newYear) });
    if (!preview) fail("Olay bulunamadı.");
    const p = preview as { inBounds: boolean };
    if (!p.inBounds) fail("Yeni yıl kategorinin zaman çizelgesinin dışında; kaydedilemez.");
    return preview;
  });
}

export async function correctEventYear(eventId: Arg, newYear: Arg, precision: Arg, note: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const result = await adminRpc("admin_update_event_year", {
      p_actor: actorId,
      p_event_id: uuid(eventId),
      p_year: year(newYear),
      p_precision: oneOf(precision ?? "year", PRECISIONS, "hassasiyet"),
      p_note: text(note) ?? fail("Not zorunlu."),
    });
    revalidate("events", "daily");
    return result;
  }, "Tarih güncellendi; açık oylar kapandı.");
}

export async function dismissChallenges(eventId: Arg, note: Arg) {
  const { actorId } = await requireAdmin();
  return guard(
    () => adminRpc("admin_dismiss_challenges", { p_actor: actorId, p_event_id: uuid(eventId), p_note: text(note) }),
    "İtirazlar incelendi olarak kapatıldı.",
  );
}

export async function saveEventTranslations(eventId: Arg, rowsJson: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    let rows: { locale: string; name: string; description: string | null }[];
    try {
      rows = JSON.parse(String(rowsJson ?? "[]"));
    } catch {
      fail("Çeviriler okunamadı.");
    }
    if (!Array.isArray(rows) || rows.some((r) => !SUPPORTED_LOCALES.includes(r.locale as never))) {
      fail("Geçersiz dil.");
    }
    if (rows.some((r) => !String(r.name ?? "").trim())) fail("Ad boş bırakılamaz.");
    await adminRpc("admin_upsert_event_translations", {
      p_actor: actorId,
      p_event_id: uuid(eventId),
      p_rows: rows as unknown as Json,
      p_note: null,
    });
    revalidate("events", "daily");
    return null;
  }, "Çeviriler kaydedildi.");
}

/** `ids` is a comma-separated list (bulk selection) or one id. */
export async function setEventStatus(ids: Arg, status: Arg, note?: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const list = String(ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(uuid);
    if (list.length === 0) fail("Olay seçilmedi.");
    const n = await adminRpc("admin_set_event_status", {
      p_actor: actorId,
      p_ids: list,
      p_status: oneOf(status, STATUSES, "durum"),
      p_note: text(note),
    });
    revalidate("events", "daily");
    return n;
  }, "Durum güncellendi.");
}

export async function setEventSensitive(eventId: Arg, value: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    await adminRpc("admin_set_event_sensitive", {
      p_actor: actorId,
      p_event_id: uuid(eventId),
      p_value: value === true || value === "true",
      p_note: null,
    });
    revalidate("events");
    return null;
  });
}

export async function setEventCategory(eventId: Arg, topicSlug: Arg, tagSlug?: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    await adminRpc("admin_set_event_category", {
      p_actor: actorId,
      p_event_id: uuid(eventId),
      p_topic: text(topicSlug),
      p_tag: text(tagSlug),
      p_note: null,
    });
    revalidate("events", "categories");
    return null;
  }, "Konu güncellendi.");
}

export async function previewDeleteEvent(eventId: Arg) {
  await requireAdmin();
  return guard(async () => {
    const preview = await adminRpc("admin_delete_event_preview", { p_event_id: uuid(eventId) });
    if (!preview) fail("Olay bulunamadı.");
    return preview;
  });
}

export async function deleteEventPermanently(eventId: Arg, typedName: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    await adminRpc("admin_delete_event", {
      p_actor: actorId,
      p_event_id: uuid(eventId),
      p_typed_name: String(typedName ?? ""),
      p_note: null,
    });
    revalidate("events", "daily", "categories");
    return null;
  }, "Olay kalıcı olarak silindi.");
}

/** Slug from the EN name (CLAUDE.md's rule) and whether it is free. */
export async function suggestSlug(name: Arg) {
  await requireAdmin();
  return guard(async () => {
    const slug = slugify(String(name ?? ""));
    return { slug, taken: slug ? await slugTaken(slug) : false };
  });
}

export async function checkSlug(slug: Arg) {
  await requireAdmin();
  return guard(async () => {
    const s = String(slug ?? "");
    return { slug: s, valid: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s), taken: await slugTaken(s) };
  });
}

async function slugTaken(slug: string): Promise<boolean> {
  const { count, error } = await createAdminDbClient()
    .from("event")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export interface CreateEventInput {
  topic: string | null;
  slug: string;
  year: number;
  precision: string;
  isSensitive: boolean;
  tag: string | null;
  translations: { locale: string; name: string; description: string | null }[];
}

/**
 * The single-event form (§6.4). The image, when given, goes through the
 * same upload flow as the images page after the event exists
 * (`uploadEventImage` in ./images.ts) — the form calls both, in order.
 */
export async function createEvent(input: CreateEventInput, publish: boolean) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    if (!input || typeof input !== "object") fail("Eksik form.");
    const id = await adminRpc("admin_create_event", {
      p_actor: actorId,
      p_input: {
        slug: String(input.slug ?? ""),
        year: year(input.year),
        precision: oneOf(input.precision ?? "year", PRECISIONS, "hassasiyet"),
        isSensitive: Boolean(input.isSensitive),
        topic: input.topic || null,
        tag: input.tag || null,
        translations: input.translations,
      } as unknown as Json,
      p_status: publish ? "published" : "draft",
      p_note: null,
    });
    revalidate("events", "categories");
    return id;
  }, publish ? "Olay yayınlandı." : "Taslak kaydedildi.");
}

export async function parseBulkEvents(topicSlug: Arg, fileText: Arg): Promise<Awaited<ReturnType<typeof guard<BulkParse>>>> {
  await requireAdmin();
  return guard(async () => {
    const body = String(fileText ?? "");
    if (body.length > 5_000_000) fail("Dosya çok büyük (en fazla 5 MB).");
    return parseBulk(String(topicSlug ?? ""), body);
  });
}

export async function importBulkEvents(topicSlug: Arg, rows: BulkRow[], status: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    if (!Array.isArray(rows) || rows.length === 0) fail("Eklenecek satır yok.");
    const n = await adminRpc("admin_import_events", {
      p_actor: actorId,
      p_topic: text(topicSlug) === "history" ? null : text(topicSlug),
      p_rows: rows as unknown as Json,
      p_status: oneOf(status, ["draft", "published"] as const, "durum"),
      p_note: null,
    });
    revalidate("events", "categories");
    return n;
  }, "Olaylar eklendi.");
}
