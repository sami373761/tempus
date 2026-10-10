/**
 * Caps the size of the photographs the games actually download.
 *
 *   npm run images:shrink -- --dry-run          report what would change
 *   npm run images:shrink                       rewrite everything over budget
 *   npm run images:shrink -- --prefix film-dizi/
 *   npm run images:shrink -- --threshold 300000 --max-dim 1200
 *
 * The pictures in the bucket arrived at whatever size they were found at:
 * 5224x4066 camera scans of nine megabytes next to 480px thumbnails. A game
 * round is one `<img>` swap, so the master's byte size *is* the wait between
 * pressing "next round" and seeing the next question — and at the top of the
 * range that is seconds on a normal connection, which no amount of prefetching
 * hides.
 *
 * **No photograph on this site is ever displayed above 631 CSS px.** That is
 * the widest `sizes` any surface declares (`STAGE_SIZES` in
 * components/home-explorer.tsx; the date-guessing card is 546px and the film &
 * television poster 416px), so 1600px on the long edge is still more than two
 * device pixels per CSS pixel on a retina screen at the largest of them. Every
 * byte beyond that is downloaded, decoded and thrown away.
 *
 * What it does, per image row over `--threshold`:
 *
 *   1. downloads the object the row points at;
 *   2. resamples it so its long edge is at most `--max-dim`, as JPEG, with
 *      `sips` — macOS's own resampler, the same one `derive-backdrops.ts` uses,
 *      so a picture rewritten here matches the derived backdrops it sits next to;
 *   3. uploads it beside the master as `<base>-<max-dim>.jpg`;
 *   4. re-points the row at it, with `byte_size`, `width`, `height`,
 *      `mime_type` and `checksum_sha256` re-probed from the new bytes.
 *
 * **The master is never touched.** It stays in the bucket under its original
 * key, which is the same contract `derive-backdrops.ts` keeps: the derivative
 * is what the page loads and the master is what the derivative can be made
 * again from. Nothing falls back to it, so a derivative must not be deleted on
 * its own — but unlike a backdrop, a missing one here cannot break a page,
 * because the row names exactly one object and that object is the one the row
 * was written from.
 *
 * Provenance is left alone. `source_page_url`, `license_code`, `author` and
 * `attribution_text` describe where the picture came from and under what terms,
 * and resampling it changes none of that — which is why this updates a row in
 * place instead of going through `attachImage()`, whose job is to *establish*
 * provenance for a key that has none.
 *
 * **Backdrops and decorative art are out of reach by construction.** The
 * candidate list is `public.image` rows and nothing else, and no backdrop has
 * one: `parseImageObjectKey()` rejects `date-guessing-game/`, `comparison-game/`,
 * `homepage/` and `film-dizi/siyah_perde_8K` by design, so those photographs
 * have no row to find. They are full-bleed — a resample would be visible as a
 * soft background, which is the opposite of the point here — and they already
 * have their own derived `-1440`/`-2560` widths from `backdrops:derive`. There
 * is deliberately no `--include-decorative` flag: a prefix filter is the only
 * way to narrow this run, never to widen it.
 *
 * Idempotent. A row already pointing at a derivative is skipped unless
 * `--force` is passed, so this can be re-run after every attach.
 *
 * Two encoders, chosen by whether the picture has an alpha channel:
 *
 *   * **No alpha — JPEG via `sips`.** The common case, 97% of the bucket.
 *   * **Alpha — WebP via `cwebp`.** Flattening transparency onto JPEG's opaque
 *     canvas would paint it black, and re-encoding a PNG is worse than
 *     pointless: `sips` rewrote the four transparent PNGs here at 3.5-4.4 MB
 *     each, two of them *larger* than the 2.7-8.7 MB masters, because PNG
 *     cannot compress a photograph. The same pictures are 274-510 KB as lossy
 *     WebP with the alpha channel intact. WebP is already 55 of the images in
 *     this bucket, so this adds a format to nothing.
 *
 * `cwebp` is not part of macOS (`brew install webp`). It is looked up only when
 * a transparent image actually turns up, and a run without it refuses those few
 * by name and still rewrites everything else.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { r2 } from "./attach-core.ts";
import { probeImage } from "./image-probe.ts";

/**
 * Long-edge cap, and the suffix the rewritten key carries. 1600 against a
 * 631px widest display is 2.5x on the long edge — sharp at 2x DPR with room
 * left, and about a twentieth of the bytes of the largest masters.
 */
const DEFAULT_MAX_DIM = 1600;

/**
 * Below this, rewriting costs more than it saves: a 600KB photograph is
 * already under a tenth of a second on a normal connection, and re-encoding it
 * would spend quality to save bytes nobody waits for.
 */
const DEFAULT_THRESHOLD = 600_000;

/** sips' JPEG quality, 0-100. 82 is where artefacts stop being findable. */
const DEFAULT_QUALITY = 82;

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
 * and re-running has to read that as done rather than put it through JPEG a
 * second time.
 *
 * **The suffix alone does not identify a derivative** — that is what
 * `isDerivative()` is for. `ce/germany-brazil-7-1.jpg` is a 7-1 scoreline and
 * `ce/revolutions-of-1848.jpg` is a year; both are masters whose own slug ends
 * in a number, and a digit-counting rule skips one or the other whichever way
 * the threshold is set.
 */
const WIDTH_SUFFIX = /-\d+\.(?:jpg|webp)$/;

interface Row {
  id: string;
  slug: string;
  key: string;
  width: number | null;
  height: number | null;
}

const { s3, bucket } = r2();
const client = await connect();
const work = mkdtempSync(join(tmpdir(), "tempus-shrink-"));

let rewritten = 0;
let savedBytes = 0;
/** Memoised `cwebp()` lookup. Declared here, above the top-level await that
 *  calls it — a `let` further down the file is still in its dead zone then. */
let cwebpPath: string | null | undefined;
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
    `select i.id, e.slug, i.r2_object_key, i.byte_size::text, i.width, i.height
       from public.image i
       join public.event e on e.id = i.event_id
      where i.byte_size > $1
        and ($2::text is null or i.r2_object_key like $2 || '%')
      order by i.byte_size desc`,
    [threshold, prefix ?? null],
  );

  const candidates: Row[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    key: r.r2_object_key,
    width: r.width,
    height: r.height,
  }));

  console.log(`target    : ${dryRun ? "dry run" : describeTarget()}`);
  console.log(`bucket    : ${bucket}`);
  console.log(`threshold : ${kb(threshold)}  (rows above this are rewritten)`);
  console.log(`long edge : ${maxDim}px, JPEG quality ${quality}`);
  if (prefix) console.log(`prefix    : ${prefix}`);
  console.log(`candidates: ${candidates.length}\n`);

  const queue = limit === null ? candidates : candidates.slice(0, limit);

  for (const row of queue) {
    if (!force && (await isDerivative(row.key))) {
      skipped.push(`${row.key} (already a derivative)`);
      continue;
    }

    const master = readFileSync(await download(row.key, join(work, "master")));

    // Alpha is read from the real bytes rather than inferred from the
    // extension: plenty of PNGs in this bucket are opaque scans.
    const alpha = hasAlpha(join(work, "master"));
    if (alpha && cwebp() === null) {
      refused.push(
        `${row.key} (transparent, and cwebp is not installed — \`brew install webp\`)`,
      );
      continue;
    }

    // `--resampleHeightWidthMax` is not a cap — it resamples to the number
    // given in *either* direction, so handing it a 400x600 image produces a
    // 1066x1600 upscale. Verified, and the reason the flag is conditional:
    // a picture already inside the cap is only re-encoded, never resampled.
    // The row's own dimensions are the fallback: `probeImage` returns null for
    // a WebP flavour it cannot measure, and a long edge of 0 would read as
    // "already inside the cap" and skip the resample on the largest file here.
    const probedMaster = probeImage(master);
    const longEdge = Math.max(
      probedMaster.width ?? row.width ?? 0,
      probedMaster.height ?? row.height ?? 0,
    );
    // A size that could not be read at all resamples anyway: capping is the
    // point, and an unknown picture is more likely to be one of the huge ones
    // than one already inside the cap.
    const resample = longEdge === 0 || longEdge > maxDim;

    // `sips` does the resampling in both paths — it is the one resampler the
    // derived backdrops were made with — and only the final encode differs.
    const resampled = join(work, alpha ? "resampled.png" : "out.jpg");
    execFileSync("/usr/bin/sips", [
      // Long edge, not width: this bucket holds 2:3 posters and 3:2
      // photographs, and capping width alone would leave a portrait picture
      // taller than the cap.
      ...(resample ? ["--resampleHeightWidthMax", String(maxDim)] : []),
      "--setProperty",
      "format",
      alpha ? "png" : "jpeg",
      // PNG ignores formatOptions; passing it unconditionally keeps one call.
      "--setProperty",
      "formatOptions",
      String(quality),
      join(work, "master"),
      "--out",
      resampled,
    ]);

    let out = resampled;
    if (alpha) {
      out = join(work, "out.webp");
      execFileSync(cwebp()!, ["-q", String(quality), "-quiet", resampled, "-o", out]);
    }

    const body = readFileSync(out);
    const probed = probeImage(body);
    // The suffix names the long edge the object actually has, so a key never
    // claims a resample that did not happen — and so `DERIVED` recognises its
    // own output on the next run.
    const target =
      `${row.key.replace(/\.[A-Za-z0-9]+$/, "")}-${resample ? maxDim : longEdge}` +
      (alpha ? ".webp" : ".jpg");

    // A re-encode that saves nothing is not worth a second object in the
    // bucket or a row that no longer names the master.
    if (body.byteLength >= master.byteLength) {
      skipped.push(
        `${row.key} (${kb(master.byteLength)} -> ${kb(body.byteLength)}, no saving)`,
      );
      continue;
    }

    console.log(
      `${dryRun ? "would  " : "rewrite"} ${row.slug}\n` +
        `         ${row.key}  ${row.width}x${row.height}  ${kb(master.byteLength)}\n` +
        `      -> ${target}  ${probed.width}x${probed.height}  ${kb(body.byteLength)}` +
        `  (${Math.round((1 - body.byteLength / master.byteLength) * 100)}% smaller)`,
    );

    savedBytes += master.byteLength - body.byteLength;
    rewritten += 1;
    if (dryRun) continue;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: target,
        Body: body,
        ContentType: probed.mimeType,
        // Immutable: the width is in the key, so the bytes at a key never change.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    // Only after the object is really in the bucket, so a row can never name
    // a key that does not exist.
    await client.query(
      `update public.image
          set r2_object_key   = $2,
              mime_type       = $3,
              byte_size       = $4,
              width           = $5,
              height          = $6,
              checksum_sha256 = $7
        where id = $1`,
      [
        row.id,
        target,
        probed.mimeType,
        body.byteLength,
        probed.width,
        probed.height,
        createHash("sha256").update(body).digest("hex"),
      ],
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
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

/**
 * Whether `key` is something this script wrote, decided by asking the bucket
 * rather than by reading the name: strip the `-<width>` tail and a derivative
 * leaves the master it was made from, while a master whose slug merely ends in
 * a number leaves a key that was never uploaded.
 *
 *   ce/battle-of-waterloo-1600.jpg  -> ce/battle-of-waterloo.jpg   exists  -> derived
 *   ce/revolutions-of-1848.jpg      -> ce/revolutions-of.jpg       absent  -> master
 *   ce/germany-brazil-7-1.jpg       -> ce/germany-brazil-7.jpg     absent  -> master
 *
 * One HEAD per candidate, and only for keys that carry the suffix at all.
 */
async function isDerivative(key: string): Promise<boolean> {
  if (!WIDTH_SUFFIX.test(key)) return false;

  const extension = key.slice(key.lastIndexOf("."));
  const withoutWidth = key.replace(WIDTH_SUFFIX, "");

  // The master keeps its own extension, which is not necessarily the
  // derivative's: a transparent PNG becomes a WebP, a 3840px AVIF a JPEG.
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
      return true;
    } catch {
      // Not this extension; try the next.
    }
  }
  return false;
}

async function download(key: string, to: string): Promise<string> {
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  writeFileSync(to, Buffer.from(await object.Body!.transformToByteArray()));
  return to;
}

/**
 * Path to `cwebp`, or null if it is not installed. Looked up once and only on
 * the first transparent image, so a run with none never needs it.
 */
function cwebp(): string | null {
  if (cwebpPath === undefined) {
    try {
      cwebpPath = execFileSync("/usr/bin/which", ["cwebp"], {
        encoding: "utf8",
      }).trim();
      if (cwebpPath === "") cwebpPath = null;
    } catch {
      cwebpPath = null;
    }
  }
  return cwebpPath;
}

/** `sips -g hasAlpha` prints `hasAlpha: yes` for an image with a channel. */
function hasAlpha(path: string): boolean {
  const out = execFileSync("/usr/bin/sips", ["-g", "hasAlpha", path], {
    encoding: "utf8",
  });
  return /hasAlpha:\s*yes/.test(out);
}

function kb(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
