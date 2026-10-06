import "server-only";

import type { User } from "@supabase/supabase-js";

import { getCurrentUser } from "./server.ts";

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

export function isAdmin(user: User | null): boolean {
  return user?.app_metadata?.role === ADMIN_ROLE;
}

/** Throws unless the caller is a signed-in admin. Use in admin layouts/actions. */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    throw new Error("Forbidden: admin role required.");
  }
  return user as User;
}
