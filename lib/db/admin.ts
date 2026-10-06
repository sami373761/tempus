import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types.ts";
import { publicEnv, serverEnv } from "../env.ts";

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY — use it only in trusted
 * server code (content ingestion, future admin routes), never behind an
 * unauthenticated handler. The `server-only` import makes bundling this into a
 * Client Component a build error.
 */
export function createAdminDbClient() {
  const { supabaseServiceRoleKey } = serverEnv();

  return createClient<Database>(publicEnv.supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
