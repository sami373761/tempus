/**
 * Profile pictures: the rules both the upload form and the upload action read.
 *
 * Safe to import from client code. The form checks the same limits before it
 * sends anything, so a 4 MB photo is refused on the spot rather than after an
 * upload — but the form's check is a courtesy; `app/actions/avatar.ts` decides.
 */

import { DEFAULT_AVATAR_SRC } from "./badges.ts";
import { publicImageUrl } from "./storage/images.ts";

/** R2 prefix every picture is written under. Pinned by a check constraint on
 *  `profile.avatar_key`, so a change here needs a migration too. */
export const AVATAR_PREFIX = "user_profile_pictures/";

/** The largest *upload* accepted. The stored file is far smaller. */
export const AVATAR_MAX_BYTES = 1024 * 1024;

/**
 * Edge of the stored square, in pixels. The largest place a picture is drawn
 * is the account card at 88px, so 256 covers it at 3x density; the leaderboard
 * draws it at a fraction of that. At this size a WebP is a few tens of KB.
 */
export const AVATAR_EDGE = 256;

/**
 * JPEG, PNG and WebP are what browsers produce and what most phones save;
 * HEIC/HEIF is what an iPhone keeps in its library. iOS usually converts to
 * JPEG on upload, but a Mac user dragging a file out of Photos or Finder sends
 * the HEIC as it is — and some browsers report it with an empty MIME type, so
 * the extension has to be listed as well as the type.
 */
export const AVATAR_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ACCEPTED_EXTENSION = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Whether a picked file looks like one of the four formats. The server sniffs
 *  the bytes regardless; this only spares a round trip for an obvious miss. */
export function looksLikeAvatarFile(file: { name: string; type: string }): boolean {
  return ACCEPTED_TYPES.has(file.type.toLowerCase()) || ACCEPTED_EXTENSION.test(file.name);
}

/** What to put in an `<img src>` for a player: their picture, or the default. */
export function avatarSrc(avatarKey: string | null | undefined): string {
  return avatarKey ? publicImageUrl(avatarKey) : DEFAULT_AVATAR_SRC;
}
