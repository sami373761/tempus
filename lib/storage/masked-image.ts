import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
} from "node:crypto";

import { serverEnv } from "../env.ts";

/**
 * Picture URLs for a round whose answer is still a secret.
 *
 * **Why the plain URL will not do.** An event photo's key is
 * `<era>/<slug>.<ext>` (CLAUDE.md), so the CDN URL `publicImageUrl()` builds
 * names the era folder — `bce/` or `ce/` — and halves the rail before the
 * player has looked at the picture; the slug next to it is one REST call from
 * the year, because `public.event` is world-readable. A masked round's picture
 * therefore goes out as `/api/masked-image/<token>`, and the token is the key
 * *encrypted*, not signed: a signature proves the server wrote a URL but still
 * carries the key in the clear, which is the whole leak.
 *
 * **Why the IV is derived, not random.** AES-GCM is normally given a fresh
 * random IV per message; here it is the first twelve bytes of an HMAC over
 * `(context, key)`, which makes the token a pure function of the two. Within a
 * context — one round of one match, one index of one daily — every view the
 * server builds names the picture by the same URL, so a refetched view does
 * not re-download it and `EventVisual` (which keys its crossfade on the URL)
 * does not flicker. Across contexts the IV differs, so the same photograph has
 * an unrelated token in every match: a player cannot keep a token → year
 * dictionary from the rounds they have seen revealed. A repeated IV is only
 * dangerous in GCM when it encrypts *different* plaintexts, and an IV that is
 * a MAC of its own plaintext repeats only for the same plaintext (this is the
 * synthetic-IV construction). Contexts are server-chosen strings and keys can
 * never contain NUL (`image_object_key_format`), so `context \0 key` cannot be
 * read two ways.
 *
 * **Why the plaintext is padded.** Ciphertext is exactly as long as the key it
 * hides, and `bce/` is one byte longer than `ce/`: with the event's name on
 * screen and the slug rule known, a token's length would still say which
 * folder it came from. Every key is padded with NULs to a multiple of
 * `PAD_BLOCK`, which at 128 bytes gives every key in the bucket today (14-72
 * characters) the same token length.
 *
 * **What it does not hide.** The bytes. The same photograph is the same file in
 * every match, and a determined player can hash what arrives; this closes the
 * free channel — the address — not the picture itself, and grading never
 * trusts the client either way. For the same reason the route does not pass
 * R2's ETag through: it would be a ready-made content hash on every response.
 *
 * The keys are derived from the service-role key, like the solo round tokens'
 * (lib/game/round-token.ts), rather than being an environment variable of their
 * own: it is already the one secret only the server holds, and rotating it
 * (CLAUDE.md, known gap 10) costs nothing worse than the pictures already on
 * screen failing to load once. The cipher and the IV are keyed separately so
 * neither key's use can say anything about the other.
 */

const ROUTE = "/api/masked-image/";

/**
 * A ceiling on what the route will even try to decode: no real token is
 * within a factor of four of it, and refusing early keeps a hostile URL from
 * costing a decipher.
 */
const MAX_TOKEN_LENGTH = 1024;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const PAD_BLOCK = 128;

/**
 * The longest key that still fits under `MAX_TOKEN_LENGTH` once padded: 768
 * decoded bytes, less the IV and the tag, rounded down to a whole block.
 */
const MAX_KEY_BYTES =
  Math.floor(((MAX_TOKEN_LENGTH * 3) / 4 - IV_BYTES - TAG_BYTES) / PAD_BLOCK) *
  PAD_BLOCK;

/**
 * `public.image.image_object_key_format`, verbatim. Anything that decrypts to
 * something else was not minted from a stored key, whatever the tag says.
 */
const STORED_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * The prefixes an event's primary image actually lives under, read off
 * `public.image`: the three era folders (football's photographs are under
 * `ce/`, its rail being wholly common era), and the subject pools attached
 * with `--allow-any-key` under folders of their own. Decorative art —
 * `homepage/`, the game backdrops, `3d-models/`, `videos/`, profile pictures —
 * is deliberately absent: none of it is ever an event's picture, so a token
 * naming it can only have been made by someone who should not be asking.
 *
 * A new subject prefix has to be added here as well as to the dev proxy
 * (app/api/r2/[...key]/route.ts), or its pictures fail in the masked games
 * exactly like a missing object.
 */
const EVENT_IMAGE_PREFIXES = [
  "bce",
  "ce",
  "future",
  "film-dizi",
  "when-born",
  "basketball",
] as const;

/**
 * One flat object under one of the prefixes, with an image extension. Single
 * segment by construction: no event image is nested, so a `/` after the
 * prefix is refused rather than interpreted.
 */
const EVENT_IMAGE_KEY = new RegExp(
  `^(?:${EVENT_IMAGE_PREFIXES.join("|")})/[A-Za-z0-9][A-Za-z0-9._-]*\\.(jpe?g|png|webp|avif)$`,
);

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

interface MaskingKeys {
  cipher: Buffer;
  iv: Buffer;
}

let cachedKeys: MaskingKeys | null = null;

function maskingKeys(): MaskingKeys {
  if (!cachedKeys) {
    const secret = serverEnv().supabaseServiceRoleKey;
    cachedKeys = {
      cipher: createHash("sha256")
        .update("tempus/masked-image/v1:")
        .update(secret)
        .digest(),
      iv: createHash("sha256")
        .update("tempus/masked-image/iv/v1:")
        .update(secret)
        .digest(),
    };
  }
  return cachedKeys;
}

/**
 * The URL a masked event's picture is served from, stable for one `context`
 * and unrelated across contexts.
 *
 * `context` names the one place the picture appears — the head-to-head passes
 * `versus:<match>:<generation>:<idx>`, the daily
 * `daily:<date>:<audience>:<idx>` — and must be fixed for as long as that
 * round is on screen, or the picture is fetched again under a new name.
 *
 * Throws for a key that is not shaped like a stored one. Every caller passes a
 * `public.image` key, which the database has already checked, so this is a
 * programming error; minting a token for it anyway would only turn the mistake
 * into a broken picture nobody could trace.
 */
export function maskedImageUrl(objectKey: string, context: string): string {
  return `${ROUTE}${seal(maskingKeys(), objectKey, context)}`;
}

/**
 * The object key a token was minted for, or null for anything the server did
 * not mint — malformed, truncated, tampered with or sealed under another
 * secret. The caller has nothing more useful to do with a bad token than
 * answer 404.
 */
export function unmaskImageToken(token: string): string | null {
  return open(maskingKeys(), token);
}

/**
 * The content type to serve `objectKey` as, or null when the key is not one an
 * event's picture can live under. The route asks this *after* unmasking, so it
 * is the second fence, not the first: it holds even if the secret leaked.
 */
export function maskedImageMimeType(objectKey: string): string | null {
  const match = EVENT_IMAGE_KEY.exec(objectKey);
  return match ? (MIME_BY_EXTENSION[match[1]!] ?? null) : null;
}

function seal(keys: MaskingKeys, objectKey: string, context: string): string {
  const plain = Buffer.from(objectKey, "utf8");
  if (!STORED_KEY.test(objectKey) || plain.length > MAX_KEY_BYTES) {
    throw new Error(
      `maskedImageUrl: "${objectKey.slice(0, 80)}" is not a stored object key.`,
    );
  }

  const padded = Buffer.alloc(
    Math.max(PAD_BLOCK, Math.ceil(plain.length / PAD_BLOCK) * PAD_BLOCK),
  );
  plain.copy(padded);

  const iv = createHmac("sha256", keys.iv)
    .update(context, "utf8")
    .update("\0")
    .update(objectKey, "utf8")
    .digest()
    .subarray(0, IV_BYTES);

  const cipher = createCipheriv("aes-256-gcm", keys.cipher, iv, {
    authTagLength: TAG_BYTES,
  });
  const body = Buffer.concat([cipher.update(padded), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

function open(keys: MaskingKeys, token: string): string | null {
  if (
    typeof token !== "string" ||
    token.length > MAX_TOKEN_LENGTH ||
    !BASE64URL.test(token)
  ) {
    return null;
  }

  const raw = Buffer.from(token, "base64url");
  // Node's decoder forgives stray trailing bits, so two spellings can decode
  // to one buffer. Insisting on the canonical one keeps the token → picture
  // mapping one-to-one, which is what makes the URL a cache key.
  if (raw.toString("base64url") !== token) return null;

  const bodyLength = raw.length - IV_BYTES - TAG_BYTES;
  if (bodyLength < PAD_BLOCK || bodyLength % PAD_BLOCK !== 0) return null;

  const iv = raw.subarray(0, IV_BYTES);
  const body = raw.subarray(IV_BYTES, IV_BYTES + bodyLength);
  const tag = raw.subarray(IV_BYTES + bodyLength);

  let padded: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keys.cipher, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    padded = Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    // The tag did not verify: tampered, truncated, or another secret's.
    return null;
  }

  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0) end -= 1;
  const objectKey = padded.subarray(0, end).toString("utf8");

  return STORED_KEY.test(objectKey) ? objectKey : null;
}
