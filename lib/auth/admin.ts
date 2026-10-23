import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { hasAdminRole } from "./role.ts";
import { getVerifiedUser } from "./server.ts";
import { createServerDbClient } from "../db/server.ts";
import {
  ADMIN_MFA,
  ADMIN_MFA_SETUP,
  ADMIN_SIGN_IN,
} from "../admin/path.ts";
import {
  ADMIN_SEEN_COOKIE,
  ADMIN_SEEN_COOKIE_OPTIONS,
  isFresh,
} from "../admin/session-seen.ts";

/**
 * Admin authorization.
 *
 * Three things, all required, checked on every admin page AND every admin
 * Server Action (a layout gate does not protect actions — an action is a
 * POST endpoint anyone can call):
 *
 *   1. Supabase Auth vouches for the user right now (`getUser`, a network
 *      call — a revoked session must not keep working until its token
 *      expires) and its `app_metadata.role` is "admin". app_metadata is
 *      writable only with the service-role key (scripts/make-admin.ts).
 *   2. The session is `aal2`: the TOTP second factor was verified in it.
 *   3. It has not been idle for 30 minutes (lib/admin/session-seen.ts).
 */
export function isAdmin(user: Pick<User, "app_metadata"> | null): boolean {
  return hasAdminRole(user?.app_metadata);
}

export type AdminGateFailure = "no-session" | "not-admin" | "needs-mfa" | "idle";

export class AdminAuthError extends Error {
  constructor(readonly reason: AdminGateFailure) {
    super(`Forbidden: admin ${reason}`);
  }
}

export interface AdminSession {
  user: User;
  /** The audit actor: the admin's auth id. */
  actorId: string;
}

/** The session's assurance level, from the locally verified token. */
export const readAal = cache(async (): Promise<"aal1" | "aal2" | null> => {
  const supabase = await createServerDbClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const aal = (data.claims as { aal?: unknown }).aal;
  return aal === "aal2" ? "aal2" : aal === "aal1" ? "aal1" : null;
});

const gate = cache(async (): Promise<
  { ok: true; session: AdminSession } | { ok: false; reason: AdminGateFailure }
> => {
  const user = await getVerifiedUser();
  if (!user) return { ok: false, reason: "no-session" };
  if (!isAdmin(user)) return { ok: false, reason: "not-admin" };
  if ((await readAal()) !== "aal2") return { ok: false, reason: "needs-mfa" };
  const seen = (await cookies()).get(ADMIN_SEEN_COOKIE)?.value;
  if (!isFresh(seen)) return { ok: false, reason: "idle" };
  return { ok: true, session: { user, actorId: user.id } };
});

/**
 * The first line of every admin Server Action. Throws unless all three
 * checks pass; on success it also moves the idle clock forward (an action
 * may set cookies, a page render may not — the middleware does it for page
 * loads).
 */
export async function requireAdmin(): Promise<AdminSession> {
  const result = await gate();
  if (!result.ok) throw new AdminAuthError(result.reason);
  try {
    (await cookies()).set(ADMIN_SEEN_COOKIE, String(Date.now()), ADMIN_SEEN_COOKIE_OPTIONS);
  } catch {
    // Not in an action (a Server Component): the middleware refreshes it.
  }
  return result.session;
}

/**
 * The page-side gate: same checks, but answers with a navigation. No
 * session or an idle one goes to the sign-in form; a non-admin gets a 404
 * (the panel does not admit it exists); an admin without the second factor
 * in this session goes to the TOTP step — or to its setup when the account
 * has no factor yet.
 */
export async function requireAdminPage(): Promise<AdminSession> {
  const result = await gate();
  if (result.ok) return result.session;
  switch (result.reason) {
    case "not-admin":
      notFound();
    case "needs-mfa": {
      const supabase = await createServerDbClient();
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.totp ?? []).some((f) => f.status === "verified");
      redirect(verified ? ADMIN_MFA : ADMIN_MFA_SETUP);
    }
    case "idle":
      redirect(`${ADMIN_SIGN_IN}?sure=doldu`);
    case "no-session":
    default:
      redirect(ADMIN_SIGN_IN);
  }
}
