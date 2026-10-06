import "server-only";

import type { User } from "@supabase/supabase-js";

import { createServerDbClient } from "../db/server.ts";

/**
 * Auth reads for server code. Supabase Auth is the identity provider; no
 * user tables of our own exist yet.
 */

/** The signed-in user, or null. Validates the token against Supabase. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createServerDbClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized: authentication required.");
  return user;
}
