/**
 * Regenerates the derived widths of a full-bleed backdrop photograph.
 *
 * The masters in R2 are 24-megapixel camera files of several megabytes. A
 * browser caches the *decoded* bitmap rather than the JPEG, so a page that puts
 * one of those on screen full-bleed holds ~100MB of texture for it — and the
 * date-guessing game, which can have three alive at once mid-crossfade, used to
 * flicker to black as Chrome evicted and re-decoded them. `-1440.jpg` and
 * `-2560.jpg` are what the pages actually load, through a `sizes="100vw"`
 * srcset; the master stays in the bucket untouched.
 *
 * So these are not "low-resolution copies" to be tidied away: deleting one
 * breaks the page that references it, because nothing falls back to the master.
 * This script exists so regenerating them is one command.
 *
 *   npm run backdrops:derive -- --prefix date-guessing-game/
 *   npm run backdrops:derive -- --key comparison-game/cosmos.jpg
 *   npm run backdrops:derive -- --prefix comparison-game/ --dry-run
 *
 * Masters are recognised by *not* carrying a `-<width>` suffix, so running it
 * over a whole prefix is idempotent: anything already derived is skipped unless
 * `--force` is passed.
 *
 * `--widths 800,1600` overrides `BACKDROP_WIDTHS` for art that is not
 * full-bleed. That list is still the default and still the one place a
 * *backdrop's* widths are written down; the override exists because a picture
 * that only ever fills half a card has no use for a 2560px copy, and deriving
 * one would ship a megabyte no browser would pick:
 *
 *   npm run backdrops:derive -- --key homepage/pattern.jpg --widths 800,1600
 *
 * Each width is written twice: `-<width>.jpg`, and `-<width>.webp` encoded
 * from it at the same pixel size — the WebP is what the pages load
 * (`ART_EXTENSION` in lib/storage/images.ts), and the JPEG is what
 * `npm run art:webp` re-encodes from.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";


import { loadEnvFile } from "./db.ts";
import { BACKDROP_WIDTHS } from "../lib/storage/images.ts";
import { backdropKey, toArtWebp } from "../lib/storage/image-derive.ts";

loadEnvFile();

const MASTER = /^(?<base>.+?)\.(?<ext>jpg|jpeg)$/i;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const prefix = argValue("--prefix");
const singleKey = argValue("--key");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const widths = parseWidths(argValue("--widths"));
/** A key that already carries one of the derived widths. */
const DERIVED = new RegExp(`-(?:${widths.join("|")})$`);

if (!prefix && !singleKey) {
  console.error("Pass --prefix <folder/> or --key <object-key>.");
  process.exit(1);
}

const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const bucket = requireEnv("R2_BUCKET_NAME");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const work = mkdtempSync(join(tmpdir(), "tempus-backdrops-"));
let written = 0;
let skipped = 0;

try {
  for (const key of await masters()) {
    const match = MASTER.exec(key);
    if (!match?.groups) continue;
    const { base } = match.groups as { base: string };

    const original = await download(key);
    const source = join(work, "master.jpg");
    writeFileSync(source, original);

    for (const width of widths) {
      const target = backdropKey(base, width, "jpg");

      if (!force && (await exists(target))) {
        console.log(`skip   ${target} (already in the bucket)`);
        skipped += 1;
        continue;
      }

      const resized = join(work, `${width}.jpg`);
      // `sips` is macOS's own resampler and is what the first set was made
      // with; keeping to it means a regenerated file matches its neighbours.
      execFileSync("/usr/bin/sips", [
        "--resampleWidth",
        String(width),
        source,
        "--out",
        resized,
      ]);

      const body = readFileSync(resized);
      // Same pixels, other format: never a second resample. Quality matches
      // scripts/art-webp.ts.
      const webp = await toArtWebp(body);
      const webpTarget = backdropKey(base, width, "webp");
      if (dryRun) {
        console.log(`would   ${target}  ${kb(body.byteLength)}`);
        console.log(`would   ${webpTarget}  ${kb(webp.byteLength)}`);
        continue;
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: target,
          Body: body,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      console.log(`wrote  ${target}  ${kb(body.byteLength)}`);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: webpTarget,
          Body: webp,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      console.log(`wrote  ${webpTarget}  ${kb(webp.byteLength)}`);
      written += 1;
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(
  `\n${dryRun ? "dry run: " : ""}${written} written, ${skipped} already present.`,
);

/** Every master under the requested prefix, or the single key asked for. */
async function masters(): Promise<string[]> {
  if (singleKey) return [singleKey];

  const keys: string[] = [];
  let token: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );

    for (const object of page.Contents ?? []) {
      const key = object.Key;
      // R2 represents an empty folder as a zero-byte object ending in `/`.
      if (!key || key.endsWith("/")) continue;

      const match = MASTER.exec(key);
      if (!match?.groups) continue;
      if (DERIVED.test(match.groups.base!)) continue;

      keys.push(key);
    }

    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return keys.sort();
}

/**
 * The widths to derive. `--widths` is a comma-separated override; without it
 * the backdrops' own list is used, which is what every full-bleed photograph
 * wants.
 */
function parseWidths(raw: string | undefined): readonly number[] {
  if (raw === undefined) return BACKDROP_WIDTHS;

  const parsed = raw.split(",").map((part) => Number(part.trim()));
  if (parsed.some((width) => !Number.isInteger(width) || width < 1)) {
    throw new Error(`--widths must be a comma-separated list of pixel widths (got "${raw}")`);
  }
  return parsed;
}

async function exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function download(key: string): Promise<Buffer> {
  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const body = object.Body;
  if (!body) throw new Error(`Empty body for ${key}`);
  return Buffer.from(await body.transformToByteArray());
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the environment.`);
  return value;
}
