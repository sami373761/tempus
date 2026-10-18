import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { accountFrom, readProfileChrome } from "../db/accounts.ts";
import { signInHref } from "./paths.ts";
import { createServerDbClient } from "../db/server.ts";
import type { Account } from "../db/types.ts";

/**
 * Auth reads for server code. Supabase Auth is the identity provider; the one
 * table of our own that an account owns is `public.profile`, read through
 * `lib/db/accounts.ts`.
 */

/**
 * Who the session belongs to, as far as the signed token says: the claims the
 * game needs (id, email, app_metadata) and nothing that lives only on the
 * `auth.users` row.
 */
export type SessionUser = Pick<User, "id" | "email" | "app_metadata">;

/**
 * The signed-in user, or null — from the access token, verified locally.
 *
 * `getClaims()` checks the token's ES256 signature against the project's
 * published keys (fetched once per process) instead of asking Supabase Auth,
 * which is ~400 ms to the database's region and used to be paid twice before
 * every page's first byte. A token is still refreshed through the cookie when
 * it has expired — `getClaims` goes through `getSession` first.
 *
 * What it cannot see is a session revoked elsewhere: until the access token
 * expires (an hour at most) a signed-out device still reads as signed in. That
 * is acceptable for a game's identity; the two places where it is not —
 * changing a password and the admin gate — use `getVerifiedUser`.
 *
 * `cache()` makes it one read per render however many components ask.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerDbClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const { claims } = data;
  if (!claims.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    app_metadata: (claims.app_metadata ?? {}) as User["app_metadata"],
  };
});

/**
 * The full user record, validated by Supabase Auth on every call. A network
 * round trip — only for what must not trust an unrevoked token or needs
 * fields the token does not carry (`identities`).
 */
export const getVerifiedUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerDbClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

/**
 * Whether an account has an email/password identity at all.
 *
 * The one fact about a session that decides the shape of the account page's
 * password form, and it is read from `user.identities` rather than kept
 * anywhere of ours: a player who signed up with Google has a `google` identity
 * and no `email` one until they set a password, at which point Supabase adds
 * one beside it. So this is the live answer on every render rather than a flag
 * that can go stale — and it is *here*, not in `app/actions/auth.ts`, because a
 * `"use server"` module may export nothing but async functions.
 *
 * Both the page and `updatePassword` ask it. Two copies of the rule would be
 * two places for the form's shape and the action's check to disagree, which is
 * the one disagreement that matters: the form decides whether to ask for a
 * current password, and the action decides whether to require one.
 */
export function hasPasswordIdentity(user: User): boolean {
  return user.identities?.some((identity) => identity.provider === "email") ?? false;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized: authentication required.");
  return user;
}

/**
 * The signed-in player as the chrome needs them: id, email and a name to
 * print. Null when nobody is signed in, which is what every caller branches
 * on.
 *
 * The profile read is guarded rather than allowed to throw. This is called by
 * the public layout on every route, and a site whose every page 500s because
 * one row could not be read would be a worse trade than a menu that shows the
 * email's local part for a request — the same reasoning the home page's event
 * count is wrapped in.
 */
export const getCurrentAccount = cache(async (): Promise<Account | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  // The name to greet them by, the badge count the menu marks and the rating
  // the 1v1 window prints, in the one read — see `readProfileChrome`. A failed
  // read costs all three and nothing else: the site has to stay usable with no
  // name, no mark and no standing.
  let profile: Awaited<ReturnType<typeof readProfileChrome>> = {
    username: null,
    unseenBadges: 0,
    chronoRating: null,
    avatarKey: null,
  };
  try {
    profile = await readProfileChrome(await createServerDbClient(), user.id);
  } catch {
    profile = {
      username: null,
      unseenBadges: 0,
      chronoRating: null,
      avatarKey: null,
    };
  }

  return accountFrom(user, profile);
});

/**
 * The signed-in player, or a redirect to the sign-in form.
 *
 * The second half of the gate in `middleware.ts`, and the half that is the
 * actual boundary: the matcher there can be narrowed by mistake, a route can be
 * added under a prefix nobody updated, and a page that calls this cannot render
 * either way. Cheap to call — `getCurrentAccount` is already being resolved for
 * the layout's menu on the same request.
 *
 * `next` is the path to come back to, so the form returns the player where they
 * were aiming rather than at their account page.
 */
export async function requireAccount(next?: string): Promise<Account> {
  const account = await getCurrentAccount();
  if (!account) redirect(signInHref(next));
  return account;
}
