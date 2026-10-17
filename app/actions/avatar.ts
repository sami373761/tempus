"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AuthState } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/server";
import { SIGN_IN_PATH } from "@/lib/auth/paths";
import { AVATAR_MAX_BYTES, AVATAR_PREFIX } from "@/lib/avatar";
import { setAvatarKey } from "@/lib/db/accounts";
import { createAdminDbClient } from "@/lib/db/admin";
import { encodeAvatar, UnsupportedAvatarFormat } from "@/lib/storage/avatar-image";
import { deleteObject, putObject } from "@/lib/storage/r2";

/**
 * Setting and clearing a player's profile picture.
 *
 * The file comes in through a Server Action rather than a presigned PUT
 * straight to R2: the point of the round trip is that the server re-encodes it
 * (lib/storage/avatar-image.ts), so what lands in the bucket is a small WebP
 * sharp wrote, not whatever the browser sent. Next's default 1 MB action body
 * is raised in next.config.ts so a file at the limit still fits beside the
 * form's own overhead.
 *
 * **Every upload gets a fresh random key.** Objects are cached as immutable,
 * so overwriting one key would leave browsers showing the old face for a year;
 * a new key is a new URL. The previous object is deleted only after the row
 * has stopped naming it, so a failure part-way leaves an orphan in the bucket
 * at worst, never a profile pointing at nothing.
 */

export async function uploadAvatar(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", code: "photo-unreadable" };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { status: "error", code: "photo-too-large" };
  }

  let webp: Buffer;
  try {
    webp = await encodeAvatar(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof UnsupportedAvatarFormat) {
      return { status: "error", code: "photo-type" };
    }
    console.error("uploadAvatar: encode failed", error);
    return { status: "error", code: "photo-unreadable" };
  }

  const objectKey = `${AVATAR_PREFIX}${randomBytes(16).toString("hex")}.webp`;
  let previous: string | null;
  try {
    await putObject({ objectKey, body: webp, contentType: "image/webp" });
    try {
      previous = await setAvatarKey(createAdminDbClient(), user.id, objectKey);
    } catch (error) {
      await deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error("uploadAvatar: store failed", error);
    return { status: "error", code: "generic" };
  }

  await removeObject(previous);
  // The account card and the leaderboard both draw it.
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export async function removeAvatar(
  _state: AuthState,
  _form: FormData,
): Promise<AuthState> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  let previous: string | null;
  try {
    previous = await setAvatarKey(createAdminDbClient(), user.id, null);
  } catch (error) {
    console.error("removeAvatar failed", error);
    return { status: "error", code: "generic" };
  }

  await removeObject(previous);
  revalidatePath("/", "layout");
  return { status: "saved" };
}

/** Best effort: the row no longer names the object, so a failed delete is
 *  an orphan in the bucket, not a broken picture. */
async function removeObject(objectKey: string | null): Promise<void> {
  if (!objectKey?.startsWith(AVATAR_PREFIX)) return;
  try {
    await deleteObject(objectKey);
  } catch (error) {
    console.error("avatar: old object not deleted", objectKey, error);
  }
}
