import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { ACCOUNT_PATH, isProtectedPath, SIGN_IN_PATH } from "@/lib/auth/paths";
import { isAdminPath } from "@/lib/admin/path";
import {
  ADMIN_SEEN_COOKIE,
  ADMIN_SEEN_COOKIE_OPTIONS,
  isFresh,
} from "@/lib/admin/session-seen";
import { publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase auth session cookie on navigation, so Server
 * Components always see a valid token — and gates the two routes that need an
 * account.
 *
 * The gate is here rather than in each page because it has to answer *before*
 * the page renders: a signed-out visitor following the menu's Achievements row
 * should land on the sign-in form, not on a flash of the page followed by a
 * client-side bounce. The pages still check for themselves (see
 * `requireAccount`), so a route is never readable merely because the matcher
 * missed it — the matcher is an optimisation, not the boundary.
 *
 * It only ever redirects in two directions, and both are stated as one rule:
 * no account on a protected route goes to the form, and an account on the form
 * goes on to wherever it was heading. Nothing else is touched — the games, the
 * home page and the leaderboard are all playable and readable signed out, which
 * is deliberate.
 *
 * Admin authorization is separate and stays next to the routes that need it
 * (lib/auth/admin.ts): an `app_metadata` claim is not something a cookie
 * refresh should be interpreting.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  /* `getClaims`, not `getUser`: the token's signature is checked locally
     against the project's ES256 keys, where `getUser` was a ~400 ms round trip
     to Supabase Auth in front of every page and every deal. An expired token
     is still refreshed here (it goes through `getSession`), which is the half
     of this file the cookie depends on. A session revoked elsewhere passes
     until its token expires; the pages that care re-check (`requireAccount`
     is the boundary, `getVerifiedUser` the strict read). */
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims.sub ? data.claims : null;

  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = SIGN_IN_PATH;
    url.search = "";
    // Where to come back to, including whatever query the player was carrying.
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  /* Signed in, standing on the sign-in form: there is nothing on that page for
     them. It is reachable this way from a bookmark or from the browser's back
     button after signing in, and showing an empty form in either case reads as
     having been signed out. */
  if (user && pathname === SIGN_IN_PATH) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    url.pathname =
      next && next.startsWith("/") && !next.startsWith("//")
        ? next.split("?")[0]!
        : ACCOUNT_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  /* The admin panel's idle clock (lib/admin/session-seen.ts): a page load
     inside the panel counts as activity, but only while the clock is still
     running — an expired one is left expired, so the page's own gate sends
     the visitor back to the sign-in form. Authorization itself is never
     decided here; requireAdminPage / requireAdmin do that. */
  if (user && isAdminPath(pathname) && isFresh(request.cookies.get(ADMIN_SEEN_COOKIE)?.value)) {
    response.cookies.set(ADMIN_SEEN_COOKIE, String(Date.now()), ADMIN_SEEN_COOKIE_OPTIONS);
  }

  return response;
}

export const config = {
  matcher: [
    /* Everything but static assets and the auth callback. The callback must be
       excluded: it is the one route whose whole job is to exchange a `code` for
       a session, and a middleware that reads the session first would run before
       there is one. The masked round pictures are excluded too: their URLs end
       in an opaque token rather than an image extension, so the asset rule
       below misses them, and a session refresh per picture would put a
       Supabase round trip in front of every image of a match for nothing — the
       route reads no session. The online match's heartbeat likewise: it is
       authorised by its seat token, never by a cookie, and it fires every
       second and a half for most of a round.

       **Server Action calls are skipped too** (`missing: next-action`). For a
       signed-in player the session check here is a round trip to Supabase
       Auth, and it ran in front of every action — every lock-in, every
       reveal — while the actions that need an account read it themselves
       (`getCurrentUser`, which refreshes an expired session and can write the
       cookie, since an action may), and the ones that do not, never did. The
       gate is for page loads; an action is not one. */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|auth/callback|api/masked-image/|api/versus/tick|.*\\.(?:svg|png|jpg|jpeg|webp|avif|mp4|ico)$).*)",
      missing: [{ type: "header", key: "next-action" }],
    },
  ],
};
