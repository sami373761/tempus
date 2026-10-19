/**
 * The one implementation of the image derivatives the site serves:
 *
 *   * an event photograph's WebP, long edge ≤ 1600, from the master — what
 *     `npm run images:shrink` writes and what the admin panel writes on
 *     every upload (lib/admin/image-upload.ts);
 *   * a backdrop's `-1440` / `-2560` widths in .jpg and .webp — what
 *     `npm run backdrops:derive` and the panel's category backdrop upload
 *     write.
 *
 * Pure byte-in/byte-out over sharp, no R2 and no database, so both scripts/
 * (plain node) and the app import it. No `server-only` marker for that
 * reason; sharp itself cannot reach a client bundle.
 */

import { createHash } from "node:crypto";

import sharp from "sharp";

import { probeImage } from "./image-probe.ts";

/** Long-edge cap for event photographs (see scripts/shrink-event-images.ts). */
export const EVENT_IMAGE_MAX_DIM = 1600;
export const EVENT_IMAGE_WEBP_QUALITY = 80;
/** Backdrop / decorative art WebP quality, as scripts/art-webp.ts. */
export const ART_WEBP_QUALITY = 82;

export interface ProbedBytes {
  mime: string;
  width: number | null;
  height: number | null;
  bytes: number;
  sha256: string;
}

/** Type, size, dimensions and checksum from the bytes — never typed by hand. */
export function probeBytes(body: Buffer): ProbedBytes {
  const info = probeImage(body);
  return {
    mime: info.mimeType,
    width: info.width,
    height: info.height,
    bytes: body.byteLength,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

/**
 * The event photograph's served derivative: EXIF-rotated, resampled
 * (Lanczos) so the long edge is at most `maxDim`, never upscaled, WebP.
 */
export async function encodeEventWebp(
  master: Buffer,
  options: { maxDim?: number; quality?: number } = {},
): Promise<{ body: Buffer; width: number; height: number; longEdge: number }> {
  const maxDim = options.maxDim ?? EVENT_IMAGE_MAX_DIM;
  const { data, info } = await sharp(master, { failOn: "none" })
    .rotate()
    .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
    .webp({ quality: options.quality ?? EVENT_IMAGE_WEBP_QUALITY, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  return { body: data, width: info.width, height: info.height, longEdge: Math.max(info.width, info.height) };
}

/** `ce/battle-of-waterloo.jpg` + 1600 -> `ce/battle-of-waterloo-1600.webp`. */
export function eventWebpKey(masterKey: string, longEdge: number): string {
  return `${masterKey.replace(/\.[A-Za-z0-9]+$/, "")}-${longEdge}.webp`;
}

/** Same pixels, other format — never a second resample. */
export async function toArtWebp(body: Buffer): Promise<Buffer> {
  return sharp(body).rotate().webp({ quality: ART_WEBP_QUALITY, effort: 6, smartSubsample: true }).toBuffer();
}

/** `<base>-<width>.<ext>`, the backdrop naming BACKDROP_WIDTHS assumes. */
export function backdropKey(base: string, width: number, ext: "jpg" | "webp"): string {
  return `${base}-${width}.${ext}`;
}

/**
 * Backdrop derivatives from a master: one JPEG and one WebP per width. The
 * master must be at least as wide as the widest derivative — a backdrop is
 * never upscaled (§7.7) — so a narrower master is refused.
 */
export async function deriveBackdrop(
  master: Buffer,
  widths: readonly number[],
): Promise<{ width: number; jpg: Buffer; webp: Buffer }[]> {
  const meta = await sharp(master).metadata();
  const sourceWidth = meta.width ?? 0;
  const widest = Math.max(...widths);
  if (sourceWidth < widest) {
    throw new Error(`too-small: backdrop master is ${sourceWidth}px wide, needs ≥ ${widest}px`);
  }
  const out: { width: number; jpg: Buffer; webp: Buffer }[] = [];
  for (const width of widths) {
    const jpg = await sharp(master, { failOn: "none" })
      .rotate()
      .resize({ width, kernel: "lanczos3" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    out.push({ width, jpg, webp: await toArtWebp(jpg) });
  }
  return out;
}
