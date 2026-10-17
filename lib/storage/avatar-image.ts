import "server-only";

import decodeHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";

import { AVATAR_EDGE } from "../avatar.ts";

/**
 * Turns an uploaded photo into the one file a profile picture is stored as: a
 * 256px square WebP with no metadata.
 *
 * **Every upload is re-encoded, whatever it arrived as.** That is what makes
 * the stored file small, but it is also the safety property: the bytes in the
 * bucket are ones sharp wrote, never ones a browser sent, and a re-encode drops
 * EXIF — which on a phone photo includes where it was taken.
 *
 * The format is decided by the file's first bytes, not its name or MIME type,
 * both of which the client chooses.
 *
 * HEIC goes through `heic-decode` (libheif in WebAssembly) because sharp's
 * prebuilt libvips reads AVIF only — HEVC is not in it. libheif applies the
 * file's rotation itself; for the other three `rotate()` does it from EXIF.
 */

export type AvatarFormat = "jpeg" | "png" | "webp" | "heic";

/** Thrown for bytes that are none of the four formats. */
export class UnsupportedAvatarFormat extends Error {}

/**
 * A ceiling on decoded size. A 4 MB file can still declare enormous
 * dimensions, and decoding is width × height × 4 bytes of memory before
 * anything is resized. 50 MP admits a 48 MP iPhone frame.
 */
const MAX_INPUT_PIXELS = 50_000_000;

export function sniffAvatarFormat(bytes: Uint8Array): AvatarFormat | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  // ISO-BMFF: a `ftyp` box first, its major brand naming the family. AVIF
  // (`avif`) shares the container and is deliberately not on the list.
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "heic";
    }
  }
  return null;
}

export async function encodeAvatar(bytes: Uint8Array): Promise<Buffer> {
  const format = sniffAvatarFormat(bytes);
  if (!format) throw new UnsupportedAvatarFormat();

  const image = format === "heic" ? await heicToSharp(bytes) : sharp(bytes, {
    limitInputPixels: MAX_INPUT_PIXELS,
    // First frame only: an animated WebP or APNG becomes a still.
    animated: false,
  }).rotate();

  return image
    .resize(AVATAR_EDGE, AVATAR_EDGE, { fit: "cover", position: "centre" })
    .webp({ quality: 80, effort: 5 })
    .toBuffer();
}

async function heicToSharp(bytes: Uint8Array): Promise<Sharp> {
  // `all` reads the dimensions without decoding, so an oversized frame is
  // refused before its pixels are allocated.
  const images = await decodeHeic.all({ buffer: bytes });
  try {
    const first = images[0];
    if (!first) throw new Error("HEIC has no image");
    if (first.width * first.height > MAX_INPUT_PIXELS) {
      throw new Error("HEIC is too large to decode");
    }

    const { width, height, data } = await first.decode();
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    });
  } finally {
    images.dispose();
  }
}
