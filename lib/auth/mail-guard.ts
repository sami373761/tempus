import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "../env.ts";

/**
 * The two safeguards our own account mail needs now that Supabase's mailer is
 * out of the loop.
 *
 * ## A send throttle
 *
 * Supabase used to rate-limit its confirmation mail; sending it ourselves
 * means a sign-up form could otherwise be used to mail any address on earth
 * as often as someone presses the button. Counted in memory: production is one
 * Node process on one VM (docs/SERVER.md), so a process-local map *is* the
 * whole site's view, and a restart forgetting the counts costs nothing worse
 * than one extra mail. A second process would need this moved into Postgres.
 *
 * ## A recovery mark
 *
 * A password-reset link signs the player in, and that session is
 * indistinguishable from any other — Supabase stamps it `amr: otp`, the same
 * as a confirmed sign-up. The reset page must let *only* someone who just
 * came through a reset link set a password without the current one, or a
 * borrowed, unlocked browser could lock its owner out. So the link's landing
 * sets a short-lived, signed, httpOnly cookie naming the user, and the reset
 * action requires it.
 */

const MINUTE = 60_000;

/** Per address: one mail a minute, five an hour. Per IP: twenty an hour. */
const LIMITS = {
  addressGapMs: MINUTE,
  addressPerHour: 5,
  ipPerHour: 20,
} as const;

const sent = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const kept = (sent.get(key) ?? []).filter((at) => now - at < 60 * MINUTE);
  if (kept.length) sent.set(key, kept);
  else sent.delete(key);
  return kept;
}

/**
 * Whether one more account mail may go to `email` from `ip`, and if so,
 * counts it. Called before the token is minted, so a refused send leaves no
 * fresh link behind.
 */
export function allowAuthMail(email: string, ip: string): boolean {
  const now = Date.now();
  const byAddress = recent(`a:${email.toLowerCase()}`, now);
  const byIp = recent(`i:${ip}`, now);

  const last = byAddress[byAddress.length - 1];
  if (last !== undefined && now - last < LIMITS.addressGapMs) return false;
  if (byAddress.length >= LIMITS.addressPerHour) return false;
  if (byIp.length >= LIMITS.ipPerHour) return false;

  sent.set(`a:${email.toLowerCase()}`, [...byAddress, now]);
  sent.set(`i:${ip}`, [...byIp, now]);
  return true;
}

export const RECOVERY_COOKIE = "tempus_recovery";
/** Long enough to type a new password twice; short enough to be one sitting. */
export const RECOVERY_TTL_SECONDS = 15 * 60;

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  // Derived from the service-role key for the reason given in
  // lib/game/round-token.ts: it is already the one secret only the server has.
  if (!cachedKey) {
    cachedKey = createHash("sha256")
      .update("tempus/recovery-mark/v1:")
      .update(serverEnv().supabaseServiceRoleKey)
      .digest();
  }
  return cachedKey;
}

function mac(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function signRecoveryMark(userId: string): string {
  const body = `${userId}.${Date.now() + RECOVERY_TTL_SECONDS * 1000}`;
  return `${body}.${mac(body)}`;
}

/** True when the mark is genuine, unexpired and names this user. */
export function verifyRecoveryMark(mark: string | undefined, userId: string): boolean {
  if (!mark) return false;
  const cut = mark.lastIndexOf(".");
  if (cut < 0) return false;
  const body = mark.slice(0, cut);
  const given = Buffer.from(mark.slice(cut + 1));
  const expected = Buffer.from(mac(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;

  const [id, expires] = body.split(".");
  return id === userId && Number(expires) > Date.now();
}
