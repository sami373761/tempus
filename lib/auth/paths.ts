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
