"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types.ts";
import { publicEnv } from "../env.ts";

/**
 * Supabase client for Client Components. Uses the anon key, so every read is
 * constrained by the RLS policies in
 * supabase/migrations/20261002120100_rls_policies.sql.
 */
export function createBrowserDbClient() {
  return createBrowserClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
