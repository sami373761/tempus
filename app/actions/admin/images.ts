"use server";

import { fail, guard } from "@/lib/admin/guard";
import { PD_LIKE, uploadEventImage as upload } from "@/lib/admin/image-upload";
import { revalidate } from "@/lib/admin/revalidate";
import { requireAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { createAdminDbClient } from "@/lib/db/admin";
import type { Json } from "@/lib/db/database.types";
import { eraForYear } from "@/lib/historical-date";
import { copyObject } from "@/lib/storage/r2";

/** Image writes (§6.5). First line of each: `await requireAdmin()`. */

type Arg = string | number | boolean | null | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const t = (v: Arg) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
function uuid(v: Arg): string {
  if (!UUID.test(String(v ?? ""))) fail("Geçersiz kimlik.");
  return String(v);
}

async function licenseCode(code: Arg): Promise<string> {
  const value = t(code) ?? "PD";
  const { data, error } = await createAdminDbClient().from("license").select("code").eq("code", value).maybeSingle();
  if (error || !data) fail("Geçersiz lisans.");
  return value;
}

export async function uploadEventImage(
  eventId: Arg,
  file: File,
  license: Arg,
  sourceUrl?: Arg,
  author?: Arg,
  attribution?: Arg,
) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const result = await upload(actorId, uuid(eventId), file, {
      license: await licenseCode(license),
      sourcePageUrl: t(sourceUrl),
      sourceName: null,
      author: t(author),
      attribution: t(attribution),
    });
    revalidate("events", "daily");
    return result;
  }, "Görsel yüklendi ve küçültüldü.");
}

export async function updateImageAttribution(
  imageId: Arg,
  license: Arg,
  sourceUrl: Arg,
  author: Arg,
  attribution: Arg,
) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const code = await licenseCode(license);
    if (!PD_LIKE.has(code) && !t(sourceUrl)) fail("Bu lisansta kaynak adresi zorunlu.");
    await adminRpc("admin_update_image_attribution", {
      p_actor: actorId,
      p_image_id: uuid(imageId),
      p_input: { license: code, sourcePageUrl: t(sourceUrl), author: t(author), attribution: t(attribution) } as Json,
      p_note: null,
    });
    return null;
  }, "Atıf bilgisi güncellendi.");
}

/**
 * "Klasöre taşı": copies the event's images into its era folder in R2 (the
 * old objects stay — deleting is the owner's call) and re-points the rows.
 */
export async function moveImageToEraFolder(eventId: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const id = uuid(eventId);
    const db = createAdminDbClient();
    const { data: event, error } = await db.from("event").select("year").eq("id", id).maybeSingle();
    if (error || !event) fail("Olay bulunamadı.");
    const era = eraForYear(event.year);
    const { data: images } = await db.from("image").select("id, r2_object_key").eq("event_id", id);
    const moves = (images ?? [])
      .filter((i) => i.r2_object_key.split("/")[0] !== era)
      .map((i) => ({ imageId: i.id, from: i.r2_object_key, key: `${era}/${i.r2_object_key.split("/").slice(1).join("/")}` }));
    if (moves.length === 0) fail("Görseller zaten doğru klasörde.");
    for (const m of moves) await copyObject(m.from, m.key);
    await adminRpc("admin_repoint_image", {
      p_actor: actorId,
      p_event_id: id,
      p_moves: moves.map(({ imageId, key }) => ({ imageId, key })) as Json,
      p_note: null,
    });
    revalidate("events", "daily");
    return moves.length;
  }, "Görseller era klasörüne kopyalandı ve satırlar güncellendi.");
}

/** `ids`: comma-separated non-primary image ids. */
export async function deleteOrphanImages(ids: Arg) {
  const { actorId } = await requireAdmin();
  return guard(async () => {
    const list = String(ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(uuid);
    if (list.length === 0) fail("Satır seçilmedi.");
    return adminRpc("admin_delete_image_rows", { p_actor: actorId, p_ids: list, p_note: null });
  }, "Seçilen satırlar silindi (R2 nesneleri duruyor).");
}
