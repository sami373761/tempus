import "server-only";

import type { User } from "@supabase/supabase-js";

import { getVerifiedUser, type SessionUser } from "./server.ts";

/**
 * Admin authorization.
 *
 * A user is an admin when their Supabase `app_metadata.role` is "admin".
 * app_metadata is writable only with the service-role key, so it cannot be
 * self-assigned by a signed-up user:
 *
 *   supabase.auth.admin.updateUserById(id, { app_metadata: { role: "admin" } })
 */
const ADMIN_ROLE = "admin";

export function isAdmin(user: SessionUser | null): boolean {
  return user?.app_metadata?.role === ADMIN_ROLE;
}

/** Throws unless the caller is a signed-in admin. Use in admin layouts/actions. */
export async function requireAdmin(): Promise<User> {
  // Verified with Supabase Auth, not just the token: a revoked admin session
  // must not keep working until its token expires.
  const user = await getVerifiedUser();
  if (!isAdmin(user)) {
    throw new Error("Forbidden: admin role required.");
  }
  return user as User;
}
