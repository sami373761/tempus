/**
 * Reads pixel dimensions straight out of an image's header bytes.
 *
 * `image.width`/`height` exist so the UI can reserve layout space before the
 * file loads. Taking them from the bytes rather than trusting a hand-typed
 * value means they cannot drift from the object actually stored in R2.
 *
 * Supports exactly the MIME types the `image_mime_type_supported` constraint
 * allows, minus AVIF — its box structure needs a real parser, so it reports
 * unknown dimensions rather than guessing wrong ones.
 */

export interface ImageInfo {
  mimeType: string;
  width: number | null;
  height: number | null;
}

export function probeImage(buffer: Buffer): ImageInfo {
  if (isWebp(buffer)) return { mimeType: "image/webp", ...webpSize(buffer) };
  if (isPng(buffer)) return { mimeType: "image/png", ...pngSize(buffer) };
  if (isJpeg(buffer)) return { mimeType: "image/jpeg", ...jpegSize(buffer) };
  if (isAvif(buffer)) return { mimeType: "image/avif", width: null, height: null };
  throw new Error("Unrecognised image format (expected WebP, PNG, JPEG or AVIF)");
}

// --- WebP: RIFF container, three possible bitstream flavours ----------------

function isWebp(b: Buffer): boolean {
  return (
    b.length >= 16 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  );
}

function webpSize(b: Buffer): { width: number | null; height: number | null } {
  const fourcc = b.toString("ascii", 12, 16);

  // Extended format: 24-bit canvas width-1 / height-1.
  if (fourcc === "VP8X" && b.length >= 30) {
    return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }

  // Lossy: 14-bit dimensions in the VP8 keyframe header.
  if (fourcc === "VP8 " && b.length >= 30) {
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }

  // Lossless: 14-bit width-1 then 14-bit height-1, bit-packed.
  if (fourcc === "VP8L" && b.length >= 25) {
    const bits = b.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return { width: null, height: null };
}

// --- PNG: IHDR is always the first chunk -----------------------------------

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(b: Buffer): boolean {
  return b.length >= 24 && b.subarray(0, 8).equals(PNG_MAGIC);
}

function pngSize(b: Buffer): { width: number; height: number } {
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// --- JPEG: walk the segment chain to a start-of-frame marker ---------------

function isJpeg(b: Buffer): boolean {
  return b.length >= 4 && b[0] === 0xff && b[1] === 0xd8;
}

function jpegSize(b: Buffer): { width: number | null; height: number | null } {
  let offset = 2;

  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) {
      offset += 1; // Resync past padding bytes.
      continue;
    }

    const marker = b[offset + 1];
    if (marker === undefined) break;

    // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 all carry dimensions.
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      return { height: b.readUInt16BE(offset + 5), width: b.readUInt16BE(offset + 7) };
    }

    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    offset += 2 + b.readUInt16BE(offset + 2);
  }

  return { width: null, height: null };
}

// --- AVIF: ISOBMFF brand sniff only ----------------------------------------

function isAvif(b: Buffer): boolean {
  return b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(b.toString("ascii", 8, 12));
}
