/**
 * Reads pixel dimensions straight out of an image's header bytes.
 *
 * `image.width`/`height` exist so the UI can reserve layout space before the
 * file loads. Taking them from the bytes rather than trusting a hand-typed
 * value means they cannot drift from the object actually stored in R2.
 *
 * Supports exactly the MIME types the `image_mime_type_supported` constraint
 * allows. AVIF included since 2026-10-06: it needs a real box walk rather than
 * a header read, which is why it reported null dimensions until then.
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
  if (isAvif(buffer)) return { mimeType: "image/avif", ...avifSize(buffer) };
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

// --- AVIF: ISOBMFF, and the primary item's `ispe` is the only honest answer --

function isAvif(b: Buffer): boolean {
  return b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp" &&
    ["avif", "avis"].includes(b.toString("ascii", 8, 12));
}

interface Box {
  type: string;
  /** The box's payload, header already stripped. */
  body: Buffer;
}

/**
 * Walks one level of an ISOBMFF box list.
 *
 * `size === 1` means the real size is a 64-bit field after the type; `size ===
 * 0` means "to the end of the enclosing box". Both are rare in an AVIF still
 * but cost two lines to honour, and getting either wrong desynchronises the
 * walk rather than failing loudly.
 */
function boxes(buffer: Buffer): Box[] {
  const found: Box[] = [];
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    const declared = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    let size = declared;

    if (declared === 1) {
      if (offset + 16 > buffer.length) break;
      // Sizes beyond 2^53 cannot be a buffer we are holding anyway.
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (declared === 0) {
      size = buffer.length - offset;
    }

    if (size < header || offset + size > buffer.length) break;
    found.push({ type, body: buffer.subarray(offset + header, offset + size) });
    offset += size;
  }

  return found;
}

function find(list: Box[], type: string): Buffer | null {
  return list.find((box) => box.type === type)?.body ?? null;
}

/**
 * The image's dimensions are in an `ispe` box — but a single AVIF can hold
 * several (a thumbnail, an alpha plane, a gain map), so "the first one" is a
 * coin flip and "the largest" is a guess. The file says which item is the
 * picture (`pitm`) and which properties belong to it (`ipma` indexing into
 * `ipco`), so that chain is what is followed; the first `ispe` is only the
 * fallback for a file that omits the association boxes.
 */
function avifSize(b: Buffer): { width: number | null; height: number | null } {
  // `meta` is a FullBox: four bytes of version and flags before its children.
  const meta = find(boxes(b), "meta");
  if (!meta || meta.length < 4) return { width: null, height: null };

  const metaBoxes = boxes(meta.subarray(4));
  const ipco = (() => {
    const iprp = find(metaBoxes, "iprp");
    return iprp ? find(boxes(iprp), "ipco") : null;
  })();
  if (!ipco) return { width: null, height: null };

  const properties = boxes(ipco);
  const readIspe = (body: Buffer) =>
    body.length >= 12
      ? { width: body.readUInt32BE(4), height: body.readUInt32BE(8) }
      : null;

  const primary = primaryItemId(find(metaBoxes, "pitm"));
  const ipma = find(metaBoxes, "ipma");
  if (primary !== null && ipma) {
    for (const index of associatedProperties(ipma, primary)) {
      // 1-based into `ipco`, and an out-of-range index is a malformed file.
      const property = properties[index - 1];
      if (property?.type !== "ispe") continue;
      const size = readIspe(property.body);
      if (size) return size;
    }
  }

  const first = properties.find((property) => property.type === "ispe");
  return (first && readIspe(first.body)) ?? { width: null, height: null };
}

function primaryItemId(pitm: Buffer | null): number | null {
  if (!pitm || pitm.length < 6) return null;
  const version = pitm.readUInt8(0);
  return version === 0 ? pitm.readUInt16BE(4) : pitm.readUInt32BE(4);
}

/** The property indices `ipma` associates with one item, in file order. */
function associatedProperties(ipma: Buffer, item: number): number[] {
  if (ipma.length < 8) return [];
  const version = ipma.readUInt8(0);
  // Flags bit 0 widens each association from 7 bits of index to 15.
  const wide = (ipma.readUIntBE(1, 3) & 1) === 1;
  const entries = ipma.readUInt32BE(4);

  let offset = 8;
  for (let entry = 0; entry < entries; entry += 1) {
    const idWidth = version < 1 ? 2 : 4;
    if (offset + idWidth + 1 > ipma.length) return [];
    const id = idWidth === 2 ? ipma.readUInt16BE(offset) : ipma.readUInt32BE(offset);
    offset += idWidth;
    const count = ipma.readUInt8(offset);
    offset += 1;

    const indices: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (wide) {
        if (offset + 2 > ipma.length) return [];
        indices.push(ipma.readUInt16BE(offset) & 0x7fff);
        offset += 2;
      } else {
        if (offset + 1 > ipma.length) return [];
        indices.push(ipma.readUInt8(offset) & 0x7f);
        offset += 1;
      }
    }

    if (id === item) return indices;
  }

  return [];
}
