/**
 * The one implementation of "attach an R2 object to an event".
 *
 * `attach-image.ts` is the single-file CLI over this; `attach-images-bulk.ts`
 * walks a prefix and calls it per object. The validation order and the metadata
 * probing live here so the two entry points cannot drift apart — a bulk run
 * must be exactly as strict as a single attach.
 */

import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Client } from "pg";

import { probeImage } from "./image-probe.ts";
import { parseImageObjectKey } from "../lib/storage/images.ts";
import { eraForYear } from "../lib/historical-date.ts";

export interface AttachOptions {
  event: string;
  key: string;
  sourceUrl: string;
  license: string;
  sourceName: string | null;
  author: string | null;
  attribution: string | null;
  primary: boolean;
  dryRun: boolean;
  allowAnyKey: boolean;
}

export interface AttachResult {
  bucket: string;
  key: string;
  era: string | null;
  event: string;
  eventYear: number;
  mimeType: string;
  reportedContentType: string | undefined;
  width: number | null;
  height: number | null;
  byteSize: number;
  checksum: string;
  /** Null on a dry run — nothing was written. */
  imageId: string | null;
}

export function r2(): { s3: S3Client; bucket: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!accountId || !bucket) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and R2_BUCKET_NAME must be set.");
  }
  return {
    bucket,
    s3: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    }),
  };
}

/** Throws unless `code` is a row in `public.license`. */
export async function assertKnownLicense(
  client: Client,
  code: string,
): Promise<void> {
  const license = await client.query(
    "select code from public.license where code = $1",
    [code],
  );
  if (license.rows.length > 0) return;

  const all = await client.query<{ code: string }>(
    "select code from public.license order by sort_order",
  );
  throw new Error(
    `Unknown license "${code}". Known: ${all.rows.map((r) => r.code).join(", ")}`,
  );
}

/**
 * Validates and (unless `dryRun`) inserts one image row. Byte size, content
 * type, checksum and pixel dimensions always come from the object's bytes, so
 * those columns cannot drift from what is actually stored.
 *
 * Checks run cheapest-first: key shape (no I/O), then the database lookup that
 * decides the expected era, and only then the R2 download.
 */
export async function attachImage(
  client: Client,
  s3: S3Client,
  bucket: string,
  options: AttachOptions,
): Promise<AttachResult> {
  // 1. The key must sit inside an era folder.
  const parsedKey = parseImageObjectKey(options.key);
  if (!parsedKey && !options.allowAnyKey) {
    throw new Error(
      `Object key "${options.key}" is not shaped like <era>/<filename>.<ext>.\n` +
        "Images live under bce/, ce/ or future/ — e.g. ce/beginning-of-world-war-ii.webp.\n" +
        "Move the object, or pass --allow-any-key to store it as-is.",
    );
  }

  // 2. Resolve the event and check the folder agrees with its era.
  const event = await client.query<{ id: string; year: string }>(
    "select id, year::text from public.event where slug = $1",
    [options.event],
  );
  if (event.rows.length === 0) {
    throw new Error(`No event with slug "${options.event}".`);
  }
  const eventId = event.rows[0]!.id;
  const eventYear = Number(event.rows[0]!.year);
  const expectedEra = eraForYear(eventYear);

  if (parsedKey && parsedKey.era !== expectedEra) {
    throw new Error(
      `Era mismatch: "${options.event}" is year ${eventYear} (era "${expectedEra}"), ` +
        `but the key is under "${parsedKey.era}/".\n` +
        `Expected something like ${expectedEra}/${options.event}.${parsedKey.extension}`,
    );
  }

  // 3. The license must be one we know about.
  await assertKnownLicense(client, options.license);

  // 4. The object must exist, and its metadata comes from its bytes.
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: options.key }));
  } catch {
    throw new Error(
      `No object "${options.key}" in bucket "${bucket}". Upload it first.`,
    );
  }

  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: options.key }),
  );
  const body = Buffer.from(await object.Body!.transformToByteArray());
  const probed = probeImage(body);
  const checksum = createHash("sha256").update(body).digest("hex");

  const result: AttachResult = {
    bucket,
    key: options.key,
    era: parsedKey?.era ?? null,
    event: options.event,
    eventYear,
    mimeType: probed.mimeType,
    reportedContentType: object.ContentType,
    width: probed.width,
    height: probed.height,
    byteSize: body.length,
    checksum,
    imageId: null,
  };

  if (options.dryRun) return result;

  await client.query("begin");
  try {
    // One primary per event is enforced by a partial unique index, so demote
    // the incumbent rather than letting the insert collide.
    if (options.primary) {
      await client.query(
        "update public.image set is_primary = false where event_id = $1 and is_primary",
        [eventId],
      );
    }

    const inserted = await client.query<{ id: string }>(
      `insert into public.image (
         event_id, is_primary, r2_bucket, r2_object_key, mime_type,
         byte_size, width, height, checksum_sha256,
         source_name, source_page_url, author, license_code, attribution_text
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (r2_bucket, r2_object_key) do update
         set event_id         = excluded.event_id,
             is_primary       = excluded.is_primary,
             mime_type        = excluded.mime_type,
             byte_size        = excluded.byte_size,
             width            = excluded.width,
             height           = excluded.height,
             checksum_sha256  = excluded.checksum_sha256,
             source_name      = excluded.source_name,
             source_page_url  = excluded.source_page_url,
             author           = excluded.author,
             license_code     = excluded.license_code,
             attribution_text = excluded.attribution_text
       returning id`,
      [
        eventId, options.primary, bucket, options.key, probed.mimeType,
        body.length, probed.width, probed.height, checksum,
        options.sourceName, options.sourceUrl, options.author,
        options.license, options.attribution,
      ],
    );

    await client.query("commit");
    result.imageId = inserted.rows[0]!.id;
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
