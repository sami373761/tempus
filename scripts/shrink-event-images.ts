/**
 * Caps the size of the photographs the games actually download, and serves
 * them as WebP.
 *
 *   npm run images:shrink -- --dry-run          report what would change
 *   npm run images:shrink                       rewrite every primary row
 *   npm run images:shrink -- --prefix film-dizi/
 *   npm run images:shrink -- --threshold 300000 --max-dim 1200
 *
 * The pictures in the bucket arrived at whatever size they were found at:
 * 5224x4066 camera scans of nine megabytes next to 480px thumbnails. A game
 * round is one `<img>` swap, so the served object's byte size *is* the wait
 * between pressing "next round" and seeing the next question.
 *
 * **No photograph on this site is ever displayed above 631 CSS px.** That is
 * the widest `sizes` any surface declares (`STAGE_SIZES` in
 * components/home-explorer.tsx; the date-guessing card is 546px and the film &
 * television poster 416px), so 1600px on the long edge is still more than two
 * device pixels per CSS pixel on a retina screen at the largest of them.
 *
 * **WebP for everything**, not just the transparent ones it used to be kept
 * for: measured on the files the site serves, WebP q80 is 57% smaller than the
 * JPEGs at the same pixels, and the bucket's existing WebPs averaged half the
 * size of its JPEGs. Every browser the site supports decodes it, and it keeps
 * an alpha channel, so one encoder covers both cases the old JPEG/WebP split
 * existed for.
 *
 * What it does, per primary image row:
 *
 *   1. finds the **master** — the row may already point at a `-<width>.jpg`
 *      derivative from an earlier run, and encoding a derivative would put the
 *      picture through a lossy encoder twice;
 *   2. resamples it (sharp, Lanczos) so its long edge is at most `--max-dim`,
 *      never upscaling, and encodes WebP at `--quality`;
 *   3. uploads it beside the master as `<base>-<long edge>.webp`;
 *   4. re-points the row at it, with `byte_size`, `width`, `height`,
 *      `mime_type` and `checksum_sha256` read from the new bytes.
 *
 * Skipped: a row already on WebP or AVIF inside the cap (re-encoding a modern
 * format spends quality for little), and any result that is not smaller than
 * what the row serves today.
 *
 * **The master is never touched**, and neither is the old derivative: both
 * stay in the bucket. Deleting objects is the owner's call.
 *
 * Provenance is left alone. `source_page_url`, `license_code`, `author` and
 * `attribution_text` describe where the picture came from and under what terms,
 * and re-encoding it changes none of that — which is why this updates a row in
 * place instead of going through `attachImage()`.
 *
 * **Backdrops and decorative art are out of reach by construction.** The
 * candidate list is `public.image` rows and nothing else, and no backdrop has
 * one. Their WebP twins are `npm run art:webp`, which never resamples.
 *
 * **Run it last, after every attach** (CLAUDE.md): an attach makes the master
 * primary again. Idempotent — a second run finds every row already on WebP
 * inside the cap and skips it.
 */

import { createHash } from "node:crypto";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { r2 } from "./attach-core.ts";
import { encodeEventWebp, eventWebpKey } from "../lib/storage/image-derive.ts";

/**
 * Long-edge cap, and the suffix the rewritten key carries. 1600 against a
 * 631px widest display is 2.5x on the long edge — sharp at 2x DPR with room
 * left, and about a twentieth of the bytes of the largest masters.
 */
const DEFAULT_MAX_DIM = 1600;

/**
 * Rows at or under this many bytes are left alone. Zero by default: the format
 * change pays at every size (a 200 KB JPEG is a ~90 KB WebP), so the
 * threshold is only a way to narrow a run.
 */
const DEFAULT_THRESHOLD = 0;

/** WebP quality. 80 is what the measurements in docs/audit were taken at. */
const DEFAULT_QUALITY = 80;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function argNumber(flag: string, fallback: number): number {
  const raw = argValue(flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${flag} must be a positive integer (got "${raw}")`);
  }
  return value;
}

loadEnvFile();

const maxDim = argNumber("--max-dim", DEFAULT_MAX_DIM);
const threshold = argNumber("--threshold", DEFAULT_THRESHOLD);
const quality = argNumber("--quality", DEFAULT_QUALITY);
const prefix = argValue("--prefix");
const limit = argValue("--limit") === undefined ? null : argNumber("--limit", 0);
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

/**
 * The `-<width>` tail this script appends. Any width, not just `--max-dim`: a
 * picture that was already inside the cap keeps its own long edge in the name,
 * and re-running has to read that as done rather than encode it a second
 * time.
 *
 * **The suffix alone does not identify a derivative** — that is what
 * `masterOf()` is for. `ce/germany-brazil-7-1.jpg` is a 7-1 scoreline and
 * `ce/revolutions-of-1848.jpg` is a year; both are masters whose own slug ends
 * in a number, and a digit-counting rule skips one or the other whichever way
 * the threshold is set.
 */
const WIDTH_SUFFIX = /-\d+\.(?:jpg|webp)$/;

const { s3, bucket } = r2();
const client = await connect();

let rewritten = 0;
let savedBytes = 0;
const skipped: string[] = [];
const refused: string[] = [];

try {
  const { rows } = await client.query<{
    id: string;
    slug: string;
    r2_object_key: string;
    byte_size: string;
    width: number | null;
    height: number | null;
  }>(
    // Primary rows only: nothing else is ever read (CLAUDE.md), and a
    // non-primary row re-pointed here would be one more name on the
    // `image_object_unique` constraint for nothing.
    `select i.id, e.slug, i.r2_object_key, i.byte_size::text, i.width, i.height
       from public.image i
       join public.event e on e.id = i.event_id
      where i.is_primary
        and i.byte_size > $1
        and ($2::text is null or i.r2_object_key like $2 || '%')
      order by i.byte_size desc`,
    [threshold, prefix ?? null],
  );

  const candidates = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    key: r.r2_object_key,
    bytes: Number(r.byte_size),
    width: r.width,
    height: r.height,
  }));

  console.log(`target    : ${dryRun ? "dry run" : describeTarget()}`);
  console.log(`bucket    : ${bucket}`);
  console.log(`threshold : ${kb(threshold)}  (rows above this are considered)`);
  console.log(`long edge : ${maxDim}px, WebP quality ${quality}`);
  if (prefix) console.log(`prefix    : ${prefix}`);
  console.log(`candidates: ${candidates.length}\n`);

  const queue = limit === null ? candidates : candidates.slice(0, limit);

  for (const row of queue) {
    try {
      await rewrite(row);
    } catch (error) {
      refused.push(`${row.key} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
} finally {
  await client.end();
}

if (skipped.length > 0) {
  console.log(`\nskipped (${skipped.length}):`);
  for (const line of skipped) console.log(`  ${line}`);
}
if (refused.length > 0) {
  console.log(`\nrefused (${refused.length}) — left exactly as they are:`);
  for (const line of refused) console.log(`  ${line}`);
}

console.log(
  `\n${dryRun ? "dry run: " : ""}${rewritten} rewritten, ` +
    `${(savedBytes / 1048576).toFixed(1)} MB saved off the download path.`,
);

async function rewrite(row: {
  id: string;
  slug: string;
  key: string;
  bytes: number;
  width: number | null;
  height: number | null;
}): Promise<void> {
  const rowLongEdge = Math.max(row.width ?? 0, row.height ?? 0);
  const modern = /\.(?:webp|avif)$/i.test(row.key);
  if (!force && modern && rowLongEdge > 0 && rowLongEdge <= maxDim) {
    skipped.push(`${row.key} (already ${row.key.split(".").pop()} inside the cap)`);
    return;
  }

  const source = (await masterOf(row.key)) ?? row.key;
  const master = await download(source);

  // The encoding itself is lib/storage/image-derive.ts, shared with the admin
  // panel's upload, so a panel upload and a shrink run produce the same file.
  const { body, width, height } = await encodeEventWebp(master, { maxDim, quality });
  const info = { width, height };
  const target = eventWebpKey(source, Math.max(width, height));

  if (target === row.key) {
    skipped.push(`${row.key} (already this derivative)`);
    return;
  }

  // Compared with what the row serves now, not with the master: the point is
  // the download path, and an earlier JPEG derivative may already be small.
  if (body.byteLength >= row.bytes) {
    skipped.push(`${row.key} (${kb(row.bytes)} -> ${kb(body.byteLength)}, no saving)`);
    return;
  }

  // Two events can share one master (a duplicate slug, a re-used picture).
  // The second would collide with the first on `image_object_unique`; it is
  // reported rather than silently left half-done.
  const taken = await client.query(
    `select 1 from public.image where r2_object_key = $1 and id <> $2`,
    [target, row.id],
  );
  if ((taken.rowCount ?? 0) > 0) {
    refused.push(`${row.key} (${target} is already another row's key)`);
    return;
  }

  console.log(
    `${dryRun ? "would  " : "rewrite"} ${row.slug}\n` +
      `         ${row.key}  ${row.width}x${row.height}  ${kb(row.bytes)}` +
      (source !== row.key ? `  (from master ${source})` : "") +
      `\n      -> ${target}  ${info.width}x${info.height}  ${kb(body.byteLength)}` +
      `  (${Math.round((1 - body.byteLength / row.bytes) * 100)}% smaller)`,
  );

  savedBytes += row.bytes - body.byteLength;
  rewritten += 1;
  if (dryRun) return;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: target,
      Body: body,
      ContentType: "image/webp",
      // Immutable: the width is in the key, so the bytes at a key never change.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  // Only after the object is really in the bucket, so a row can never name
  // a key that does not exist.
  await client.query(
    `update public.image
        set r2_object_key   = $2,
            mime_type       = 'image/webp',
            byte_size       = $3,
            width           = $4,
            height          = $5,
            checksum_sha256 = $6
      where id = $1`,
    [
      row.id,
      target,
      body.byteLength,
      info.width,
      info.height,
      createHash("sha256").update(body).digest("hex"),
    ],
  );
}

/**
 * The master `key` was derived from, or null when `key` is itself a master —
 * decided by asking the bucket rather than by reading the name: strip the
 * `-<width>` tail and a derivative leaves the master it was made from, while a
 * master whose slug merely ends in a number leaves a key that was never
 * uploaded.
 *
 *   ce/battle-of-waterloo-1600.jpg  -> ce/battle-of-waterloo.jpg   exists  -> derived
 *   ce/revolutions-of-1848.jpg      -> ce/revolutions-of.jpg       absent  -> master
 *   ce/germany-brazil-7-1.jpg       -> ce/germany-brazil-7.jpg     absent  -> master
 *
 * One HEAD per candidate, and only for keys that carry the suffix at all.
 */
async function masterOf(key: string): Promise<string | null> {
  if (!WIDTH_SUFFIX.test(key)) return null;

  const extension = key.slice(key.lastIndexOf("."));
  const withoutWidth = key.replace(WIDTH_SUFFIX, "");

  // The master keeps its own extension, which is not necessarily the
  // derivative's: a transparent PNG became a WebP, a 3840px AVIF a JPEG.
  for (const candidate of new Set([
    `${withoutWidth}${extension}`,
    `${withoutWidth}.jpg`,
    `${withoutWidth}.jpeg`,
    `${withoutWidth}.png`,
    `${withoutWidth}.webp`,
    `${withoutWidth}.avif`,
  ])) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: candidate }));
      return candidate;
    } catch {
      // Not this extension; try the next.
    }
  }
  return null;
}

async function download(key: string): Promise<Buffer> {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  return Buffer.from(await object.Body!.transformToByteArray());
}

function kb(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
