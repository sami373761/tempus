/**
 * The admin idle timeout: 30 minutes without a request signs the panel out.
 *
 * The time of the last panel request is a cookie scoped to the panel's path,
 * httpOnly and sameSite=strict. It is written by every admin action
 * (requireAdmin), by the middleware on every panel page load, and at sign-in.
 *
 * Unsigned on purpose: forging it needs the session cookies already, and an
 * attacker holding those could keep the session warm by simply using it.
 * What it protects against is a panel left open on an unattended machine.
 */
import { isProduction } from "../env.ts";
import { ADMIN_BASE } from "./path.ts";

export const ADMIN_SEEN_COOKIE = "admin_session_seen";
export const ADMIN_IDLE_MS = 30 * 60 * 1000;

export const ADMIN_SEEN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict" as const,
  path: ADMIN_BASE,
  secure: isProduction(),
  // Outlives the idle window a little so an expired value is read as
  // expired rather than as missing.
  maxAge: 60 * 60,
};

export function isFresh(value: string | undefined, now = Date.now()): boolean {
  const seen = Number(value);
  return Number.isFinite(seen) && seen > 0 && now - seen <= ADMIN_IDLE_MS && seen <= now + 60_000;
}
