/**
 * Writes the `.webp` twin of every derived piece of site art.
 *
 *   npm run art:webp -- --dry-run      report sizes, upload nothing
 *   npm run art:webp                   upload whatever is missing
 *   npm run art:webp -- --force        re-encode all of them
 *   npm run art:webp -- --quality 85
 *
 * The list is `decorativeArtKeys()` in lib/storage/images.ts — the keys the
 * pages actually load — and each one is made from the `.jpg` of the same name,
 * which is the derivative the site served before it switched format.
 *
 * **A format change, never a resample.** The WebP has exactly the JPEG's pixel
 * dimensions; nothing here takes a `width`. That is what keeps the full-bleed
 * backdrops as sharp as they were — a softer background is the one outcome
 * this must not produce. The encode is from the JPEG rather than from the
 * camera master because the master would have to be resampled to reach these
 * widths, and that is `backdrops:derive`'s job, not this script's.
 *
 * The `.jpg` stays in the bucket. Nothing loads it any more, but it is what
 * this script re-encodes from, and deleting objects is the owner's call.
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

import { r2 } from "./attach-core.ts";
import { loadEnvFile } from "./db.ts";
import { decorativeArtKeys } from "../lib/storage/images.ts";

loadEnvFile();

/**
 * 82 rather than the event images' 80: these are full-bleed and seen at 2x on
 * the widest screens, and a sky gradient shows banding a beat before a
 * photograph shows anything. Measured at 80 the three plates were 717/342/385
 * KB; 82 costs a few per cent of that.
 */
const DEFAULT_QUALITY = 82;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const quality = Number(argValue("--quality") ?? DEFAULT_QUALITY);
if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
  throw new Error(`--quality must be 1-100 (got "${argValue("--quality")}")`);
}

const { s3, bucket } = r2();

let written = 0;
let before = 0;
let after = 0;
const missing: string[] = [];

for (const target of decorativeArtKeys()) {
  const source = target.replace(/\.webp$/, ".jpg");

  if (!force && (await exists(target))) {
    console.log(`skip    ${target} (already in the bucket)`);
    continue;
  }

  const jpeg = await download(source);
  if (!jpeg) {
    missing.push(source);
    continue;
  }

  const input = sharp(jpeg);
  const { width, height } = await input.metadata();
  // `rotate()` with no argument applies the EXIF orientation, which the WebP
  // would otherwise lose along with the rest of the metadata.
  const body = await input
    .rotate()
    .webp({ quality, effort: 6, smartSubsample: true })
    .toBuffer();

  const out = await sharp(body).metadata();
  if (out.width !== width || out.height !== height) {
    throw new Error(
      `${target}: ${width}x${height} came out ${out.width}x${out.height} — refusing to upload a resample`,
    );
  }

  before += jpeg.byteLength;
  after += body.byteLength;
  console.log(
    `${dryRun ? "would  " : "write  "} ${target}  ${width}x${height}  ` +
      `${kb(jpeg.byteLength)} -> ${kb(body.byteLength)}` +
      `  (${Math.round((1 - body.byteLength / jpeg.byteLength) * 100)}% smaller)`,
  );
  if (dryRun) continue;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: target,
      Body: body,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  written += 1;
}

if (missing.length > 0) {
  console.log(`\nno .jpg to convert from (${missing.length}) — these pages will show no art:`);
  for (const key of missing) console.log(`  ${key}`);
}

console.log(
  `\n${dryRun ? "dry run: " : ""}${written} written, ` +
    `${kb(before)} -> ${kb(after)} for the ones encoded.`,
);
if (missing.length > 0) process.exitCode = 1;

async function exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function download(key: string): Promise<Buffer | null> {
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await object.Body!.transformToByteArray());
  } catch {
    return null;
  }
}

function kb(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(2)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}
