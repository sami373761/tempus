/**
 * Which routes need an account, and where a signed-out visitor is sent.
 *
 * This is the **one** list, and it is read by three things that must agree:
 * `middleware.ts` does the redirecting, the pages themselves re-check so a
 * route is never readable because the matcher missed it, and `SiteMenu` uses
 * it to point the two gated rows at the sign-in page while signed out rather
 * than at a page that would bounce.
 *
 * No `server-only` marker and no imports: middleware runs on the edge runtime
 * and the menu is a Client Component, so this file has to load in both.
 */

/** The sign-in / sign-up page. One route for both — see the form. */
export const SIGN_IN_PATH = "/signin";

/** Where the links in our account mails land: a page with one button, so a
 *  mail scanner opening the URL does not spend the one-time token. */
export const VERIFY_PATH = "/verify";

/** Where a password-reset link ends up, once it has signed the player in. */
export const RESET_PASSWORD_PATH = "/reset-password";

/** Where a signed-in player lands when they ask for their account. */
export const ACCOUNT_PATH = "/account";

/**
 * Where a sign-in with no `next` lands: the home page, where the games are.
 * It was the account page, which left a new player on a settings screen
 * instead of somewhere to play. A sign-in started from a gated page still
 * comes back to that page through `next`.
 */
export const AFTER_SIGN_IN_PATH = "/";

/**
 * Routes that need an account, as prefixes.
 *
 * Prefixes rather than exact paths so a sub-route added under either one is
 * gated by default — the failure mode of an exact list is a new page that is
 * quietly public.
 */
export const PROTECTED_PREFIXES = [ACCOUNT_PATH, "/achievements"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Where to go after signing in, taken from the `next` query parameter.
 *
 * Only a path on this site is allowed through. A `next` that a visitor can set
 * and the app will redirect to is an open redirect, and the two shapes that
 * matter are an absolute URL (`https://elsewhere/`) and a protocol-relative
 * one (`//elsewhere`) — the second is the one that looks like a path.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // A backslash is a path separator to some browsers but not to `startsWith`.
  if (value.includes("\\")) return null;
  return value;
}

/** The sign-in URL that comes back to `next` once there is an account. */
export function signInHref(next?: string | null): string {
  const safe = safeNextPath(next);
  return safe ? `${SIGN_IN_PATH}?next=${encodeURIComponent(safe)}` : SIGN_IN_PATH;
}

/**
 * The origin the visitor actually typed, for building absolute redirects.
 *
 * Not `request.url` / `nextUrl`: behind Caddy, `next start -H 127.0.0.1`
 * builds those from the address it listens on, so they come out as
 * `https://localhost:3000` — the Google callback and the sign-in bounce sent
 * live visitors there. Caddy forwards the real host and scheme, and overwrites
 * any `X-Forwarded-*` a client sends itself, so those are trusted first; on
 * the dev server there is no proxy and `Host` is the address in the bar.
 */
export function publicOrigin(headers: Headers): string {
  const host =
    headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
