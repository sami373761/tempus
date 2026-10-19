import "server-only";

import type { Json } from "../db/database.types.ts";
import { adminRpc } from "../db/admin/rpc.ts";
import { createAdminDbClient } from "../db/admin.ts";
import { eraForYear } from "../historical-date.ts";
import {
  deriveBackdrop,
  encodeEventWebp,
  eventWebpKey,
  probeBytes,
  toArtWebp,
} from "../storage/image-derive.ts";
import { BACKDROP_WIDTHS } from "../storage/images.ts";
import { deleteObject, objectExists, putObject, r2BucketName } from "../storage/r2.ts";

/**
 * The panel's image flows (§6.5, §7.7): R2 first, then ONE admin_* call for
 * the database half and its audit row. If the database refuses, the objects
 * this upload created are deleted again; objects that already existed at
 * those keys (a re-upload) are left — they were overwritten, and deleting
 * them would break the row that still points at them.
 *
 * Every upload writes the master AND its WebP derivative, so the "shrink
 * last" rule (CLAUDE.md) holds by construction: the primary row always
 * points at the derivative.
 */

export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const UPLOAD_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
/** Re-uploads reuse keys, so panel objects are not cached as immutable. */
const PANEL_CACHE = "public, max-age=86400";

export const PD_LIKE = new Set(["PD", "PD-US", "CC0-1.0"]);

export class UploadError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "UploadError";
  }
}

async function readFile(file: File): Promise<Buffer> {
  if (!(file instanceof File) || file.size === 0) throw new UploadError("bad-file");
  if (file.size > UPLOAD_MAX_BYTES) throw new UploadError("too-large");
  return Buffer.from(await file.arrayBuffer());
}

/** Where an event's images live: its era for the history pool, else its category's folder. */
export async function imageFolderFor(eventId: string): Promise<{ slug: string; folder: string; topic: string | null }> {
  const detail = (await adminRpc("admin_event_detail", { p_event_id: eventId })) as {
    event: { slug: string; year: number; topic: string | null };
  } | null;
  if (!detail) throw new UploadError("not-found");
  const { slug, year, topic } = detail.event;
  if (!topic) return { slug, folder: eraForYear(year), topic };
  const { data, error } = await createAdminDbClient()
    .from("game_category")
    .select("image_prefix")
    .eq("slug", topic)
    .maybeSingle();
  if (error || !data) throw new UploadError("not-found");
  return { slug, folder: data.image_prefix, topic };
}

async function putTracked(created: string[], key: string, body: Buffer, contentType: string): Promise<void> {
  const existed = await objectExists(key);
  await putObject({ objectKey: key, body, contentType, cacheControl: PANEL_CACHE });
  if (!existed) created.push(key);
}

async function rollback(created: string[]): Promise<void> {
  for (const key of created) await deleteObject(key).catch(() => undefined);
}

export interface ImageMeta {
  license: string;
  sourcePageUrl: string | null;
  sourceName: string | null;
  author: string | null;
  attribution: string | null;
}

export async function uploadEventImage(
  actorId: string,
  eventId: string,
  file: File,
  meta: ImageMeta,
): Promise<{ primaryId: string; masterKey: string; webpKey: string; width: number; height: number }> {
  if (!PD_LIKE.has(meta.license) && !meta.sourcePageUrl) {
    throw new UploadError("bad-input", "Bu lisansta kaynak adresi zorunlu.");
  }
  if (meta.sourcePageUrl && !/^https?:\/\//.test(meta.sourcePageUrl)) {
    throw new UploadError("bad-input", "Kaynak adresi http(s):// ile başlamalı.");
  }

  const body = await readFile(file);
  let probe;
  try {
    probe = probeBytes(body);
  } catch {
    throw new UploadError("bad-file");
  }
  if (!UPLOAD_MIME.has(probe.mime)) throw new UploadError("bad-file");

  const { slug, folder } = await imageFolderFor(eventId);
  const masterKey = `${folder}/${slug}.${EXT[probe.mime]}`;
  const webp = await encodeEventWebp(body);
  const webpKey = eventWebpKey(masterKey, webp.longEdge);
  const webpProbe = probeBytes(webp.body);

  const bucket = r2BucketName();
  const created: string[] = [];
  try {
    await putTracked(created, masterKey, body, probe.mime);
    await putTracked(created, webpKey, webp.body, "image/webp");
  } catch {
    await rollback(created);
    throw new UploadError("r2-failed");
  }

  try {
    const primaryId = await adminRpc("admin_attach_image", {
      p_actor: actorId,
      p_event_id: eventId,
      p_master: { bucket, key: masterKey, ...probe } as unknown as Json,
      p_webp: { bucket, key: webpKey, ...webpProbe } as unknown as Json,
      p_meta: meta as unknown as Json,
      p_note: null,
    });
    return { primaryId: String(primaryId), masterKey, webpKey, width: webp.width, height: webp.height };
  } catch (error) {
    await rollback(created);
    throw error;
  }
}

/** Category card (`<prefix>/card.webp`) or backdrop (`<prefix>/backdrop.jpg` + -1440/-2560). */
export async function uploadCategoryArt(
  actorId: string,
  slug: string,
  kind: "card" | "backdrop",
  file: File,
): Promise<string> {
  const body = await readFile(file);
  try {
    probeBytes(body);
  } catch {
    throw new UploadError("bad-file");
  }
  const { data, error } = await createAdminDbClient()
    .from("game_category")
    .select("image_prefix")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) throw new UploadError("not-found");
  const prefix = data.image_prefix;

  const created: string[] = [];
  let key: string;
  try {
    if (kind === "card") {
      key = `${prefix}/card.webp`;
      await putTracked(created, key, await toArtWebp(body), "image/webp");
    } else {
      key = `${prefix}/backdrop.jpg`;
      // Backdrop masters are JPEG (scripts/derive-backdrops.ts reads only
      // .jpg masters), so the derivatives can always be rebuilt from it.
      if (probeBytes(body).mime !== "image/jpeg") {
        throw new UploadError("bad-file", "Arka plan görseli JPEG olmalı.");
      }
      let derived;
      try {
        derived = await deriveBackdrop(body, BACKDROP_WIDTHS);
      } catch {
        throw new UploadError("too-small", "Arka plan görseli en az 2560 piksel genişliğinde olmalı.");
      }
      await putTracked(created, key, body, "image/jpeg");
      for (const d of derived) {
        await putTracked(created, `${prefix}/backdrop-${d.width}.jpg`, d.jpg, "image/jpeg");
        await putTracked(created, `${prefix}/backdrop-${d.width}.webp`, d.webp, "image/webp");
      }
    }
  } catch (error) {
    await rollback(created);
    if (error instanceof UploadError) throw error;
    throw new UploadError("r2-failed");
  }

  try {
    await adminRpc("admin_set_category_art", { p_actor: actorId, p_slug: slug, p_kind: kind, p_key: key, p_note: null });
  } catch (error) {
    await rollback(created);
    throw error;
  }
  return key;
}
